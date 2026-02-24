import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import AgentRequest from "@/models/AgentRequest";
import Page from "@/models/Page";
import {
  classifyAgent,
  canonicalizeUrl,
  extractSlug,
  anonymizeIp,
} from "@/lib/agent-classifier";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  GET — Query agent requests (paginated, filterable)                 */
/* ------------------------------------------------------------------ */

/**
 * GET /api/workspaces/[workspaceId]/agent-requests
 *
 * Query params:
 *   from     - ISO date (default: 30 days ago)
 *   to       - ISO date (default: now)
 *   url      - filter by canonical URL (substring match)
 *   engine   - filter by engine
 *   purpose  - filter by agent purpose
 *   page     - pagination page (default 1)
 *   limit    - page size (default 50, max 200)
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId } = await params;
    await connectToDatabase();

    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : new Date(Date.now() - 30 * 86400000);
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : new Date();
    const urlFilter = searchParams.get("url");
    const engineFilter = searchParams.get("engine");
    const purposeFilter = searchParams.get("purpose");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    // Build query
    const query: Record<string, unknown> = {
      tenantId: workspaceId,
      timestamp: { $gte: from, $lte: to },
    };
    if (urlFilter) query.canonicalUrl = { $regex: urlFilter, $options: "i" };
    if (engineFilter) query.engine = engineFilter;
    if (purposeFilter) query.agentPurpose = purposeFilter;

    const [events, total] = await Promise.all([
      AgentRequest.find(query)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AgentRequest.countDocuments(query),
    ]);

    // Aggregate summary stats for the filtered range
    const aggPipeline = [
      { $match: { tenantId: workspaceId, timestamp: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$engine",
          count: { $sum: 1 },
          uniqueUrls: { $addToSet: "$canonicalUrl" },
          avgResponseTime: { $avg: "$responseTimeMs" },
        },
      },
      {
        $project: {
          engine: "$_id",
          count: 1,
          uniquePages: { $size: "$uniqueUrls" },
          avgResponseTime: { $round: ["$avgResponseTime", 0] },
        },
      },
    ];

    const engineBreakdown = await AgentRequest.aggregate(aggPipeline);

    return NextResponse.json({
      events,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      engineBreakdown,
    });
  } catch (error) {
    console.error("Agent requests GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  POST — Ingest agent request events                                 */
/* ------------------------------------------------------------------ */

/**
 * POST /api/workspaces/[workspaceId]/agent-requests
 *
 * Accepts single events or batch ingestion.
 *
 * Body (single):
 *   { timestamp, requestPath, userAgent, ip, statusCode, cacheStatus,
 *     responseTimeMs, referrer, headers, country?, city?, ingestSource? }
 *
 * Body (batch):
 *   { events: [...] }
 *
 * Each event is classified, canonicalized, and stored. The Page collection
 * is updated (upsert) with agent request counts.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      // Also allow ingestion via API key (CRON_SECRET) for edge workers
      const authHeader = req.headers.get("authorization");
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { workspaceId } = await params;
    await connectToDatabase();

    // If session auth, check membership
    if (session?.user?.id) {
      const membership = await Membership.findOne({
        userId: session.user.id,
        workspaceId,
      });
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const rawEvents = body.events || [body];

    if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
      return NextResponse.json({ error: "No events provided" }, { status: 400 });
    }

    // Cap batch size
    const MAX_BATCH = 500;
    const eventsToProcess = rawEvents.slice(0, MAX_BATCH);

    const insertDocs = [];
    const pageUpdates: Map<
      string,
      { engine: string; count: number; timestamp: Date }
    > = new Map();

    for (const raw of eventsToProcess) {
      const userAgent = raw.userAgent || "";
      const ip = raw.ip || "";
      const headersObj = raw.headers || {};

      // Classify the request
      const classification = classifyAgent(userAgent, ip, headersObj);

      // Skip if not an AI agent
      if (!classification.isAgent) continue;

      const canonUrl = canonicalizeUrl(raw.requestPath || raw.url || "");
      const anonIp = anonymizeIp(ip);
      const ts = raw.timestamp ? new Date(raw.timestamp) : new Date();

      // Scrub PII from headers — keep only safe headers
      const safeHeaders: Record<string, string> = {};
      const SAFE_HEADER_KEYS = [
        "user-agent",
        "accept",
        "accept-language",
        "accept-encoding",
        "cache-control",
        "connection",
        "host",
      ];
      for (const key of Object.keys(headersObj)) {
        if (SAFE_HEADER_KEYS.includes(key.toLowerCase())) {
          safeHeaders[key.toLowerCase()] = headersObj[key];
        }
      }

      insertDocs.push({
        tenantId: workspaceId,
        timestamp: ts,
        canonicalUrl: canonUrl,
        requestPath: raw.requestPath || raw.url || "",
        userAgent,
        engine: classification.engine,
        agentPurpose: classification.agentPurpose,
        classificationConfidence: classification.confidence,
        statusCode: raw.statusCode || 200,
        cacheStatus: raw.cacheStatus || "",
        responseTimeMs: raw.responseTimeMs || 0,
        ip: anonIp,
        country: raw.country || "",
        city: raw.city || "",
        referrer: raw.referrer || "",
        headers: safeHeaders,
        ingestSource: raw.ingestSource || "log-upload",
      });

      // Track page updates
      const key = canonUrl;
      const existing = pageUpdates.get(key);
      if (existing) {
        existing.count++;
        if (ts > existing.timestamp) existing.timestamp = ts;
      } else {
        pageUpdates.set(key, {
          engine: classification.engine,
          count: 1,
          timestamp: ts,
        });
      }
    }

    // Bulk insert agent requests
    let inserted = 0;
    if (insertDocs.length > 0) {
      const result = await AgentRequest.insertMany(insertDocs, { ordered: false });
      inserted = result.length;
    }

    // Upsert Page records with agent request counters
    const wsOid = new mongoose.Types.ObjectId(workspaceId);
    const pageOps = Array.from(pageUpdates.entries()).map(([url, data]) => ({
      updateOne: {
        filter: { tenantId: wsOid, canonicalUrl: url },
        update: {
          $inc: {
            totalAgentRequests: data.count,
            [`engineRequestCounts.${data.engine}`]: data.count,
          },
          $set: {
            lastAgentAccessAt: data.timestamp,
            slug: extractSlug(url),
          },
          $setOnInsert: {
            tenantId: wsOid,
            canonicalUrl: url,
            title: "",
            pageType: "other",
            language: "en",
            contentLength: 0,
            hasStructuredData: false,
            schemaTypes: [],
            entities: [],
            embedding: [],
            canonicalKeywords: [],
            aiVisibilityScore: 0,
            contentEffectivenessScore: 0,
            authorityEstimate: 0,
          },
        },
        upsert: true,
      },
    }));

    if (pageOps.length > 0) {
      await Page.bulkWrite(pageOps as any);
    }

    return NextResponse.json({
      success: true,
      received: eventsToProcess.length,
      classified: insertDocs.length,
      inserted,
      pagesUpdated: pageUpdates.size,
      skipped: eventsToProcess.length - insertDocs.length,
    });
  } catch (error) {
    console.error("Agent requests POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
