import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import AgentRequest from "@/models/AgentRequest";
import AgentAggregate from "@/models/AgentAggregate";
import Page from "@/models/Page";
import mongoose from "mongoose";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  GET /api/workspaces/[workspaceId]/agent-analytics                  */
/*                                                                     */
/*  Returns pre-aggregated dashboard data for the Agent Analytics      */
/*  feature. Combines AgentAggregate rollups with live AgentRequest     */
/*  data for a comprehensive view.                                     */
/*                                                                     */
/*  Query params:                                                      */
/*    days    — lookback window (default 30, max 365)                  */
/*    engine  — optional engine filter                                 */
/*    section — optional: "overview" | "trends" | "engines" | "pages"  */
/*              | "geo" | "purposes" | "live" | "all" (default: "all") */
/* ------------------------------------------------------------------ */

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
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30", 10)));
    const engineFilter = searchParams.get("engine") || undefined;
    const section = searchParams.get("section") || "all";

    const now = new Date();
    const since = new Date(now.getTime() - days * 86400000);
    const sinceStr = since.toISOString().split("T")[0];
    const tenantObjId = new mongoose.Types.ObjectId(workspaceId);

    // Build aggregate match filter
    const aggMatch: Record<string, unknown> = {
      tenantId: tenantObjId,
      date: { $gte: sinceStr },
    };
    if (engineFilter) aggMatch.engine = engineFilter;

    // Build raw request match filter
    const rawMatch: Record<string, unknown> = {
      tenantId: workspaceId,
      timestamp: { $gte: since },
    };
    if (engineFilter) rawMatch.engine = engineFilter;

    const result: Record<string, unknown> = { days, engine: engineFilter || "all" };

    // ── Overview Stats ─────────────────────────────────────────────
    if (section === "all" || section === "overview") {
      // Current period stats from aggregates
      const overviewPipeline = [
        { $match: aggMatch },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: "$requestCount" },
            avgResponseTime: { $avg: "$avgResponseTimeMs" },
            avgCacheHitRate: { $avg: "$cacheHitRate" },
            avgConfidence: { $avg: "$avgClassificationConfidence" },
            engines: { $addToSet: "$engine" },
            urls: { $addToSet: "$canonicalUrl" },
          },
        },
        {
          $project: {
            _id: 0,
            totalRequests: 1,
            avgResponseTime: { $round: ["$avgResponseTime", 0] },
            avgCacheHitRate: { $round: ["$avgCacheHitRate", 2] },
            avgConfidence: { $round: ["$avgConfidence", 2] },
            uniqueEngines: { $size: "$engines" },
            uniquePages: { $size: "$urls" },
          },
        },
      ];

      const [overview] = await AgentAggregate.aggregate(overviewPipeline);

      // Previous period for comparison
      const prevSince = new Date(since.getTime() - days * 86400000);
      const prevSinceStr = prevSince.toISOString().split("T")[0];
      const prevMatch = {
        ...aggMatch,
        date: { $gte: prevSinceStr, $lt: sinceStr },
      };
      const [prevOverview] = await AgentAggregate.aggregate([
        { $match: prevMatch },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: "$requestCount" },
          },
        },
      ]);

      const current = overview || {
        totalRequests: 0,
        avgResponseTime: 0,
        avgCacheHitRate: 0,
        avgConfidence: 0,
        uniqueEngines: 0,
        uniquePages: 0,
      };

      const prevTotal = prevOverview?.totalRequests || 0;
      const changePercent =
        prevTotal > 0
          ? Math.round(((current.totalRequests - prevTotal) / prevTotal) * 100)
          : current.totalRequests > 0
          ? 100
          : 0;

      result.overview = {
        ...current,
        previousPeriodRequests: prevTotal,
        changePercent,
      };
    }

    // ── Trends Over Time ───────────────────────────────────────────
    if (section === "all" || section === "trends") {
      const trendsPipeline = [
        { $match: aggMatch },
        {
          $group: {
            _id: { date: "$date", engine: "$engine" },
            requests: { $sum: "$requestCount" },
            avgResponse: { $avg: "$avgResponseTimeMs" },
            cacheHitRate: { $avg: "$cacheHitRate" },
          },
        },
        { $sort: { "_id.date": 1 as const } },
      ];

      const trendsRaw = await AgentAggregate.aggregate(trendsPipeline);

      // Pivot into date-keyed structure: { date, chatgpt, gemini, ... , total }
      const dateMap = new Map<string, Record<string, number>>();
      for (const r of trendsRaw) {
        const d = r._id.date;
        const eng = r._id.engine;
        if (!dateMap.has(d)) dateMap.set(d, { total: 0 });
        const row = dateMap.get(d)!;
        row[eng] = (row[eng] || 0) + r.requests;
        row.total += r.requests;
      }

      result.trends = Array.from(dateMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({ date, ...data }));
    }

    // ── Engine Breakdown ───────────────────────────────────────────
    if (section === "all" || section === "engines") {
      const enginePipeline = [
        { $match: aggMatch },
        {
          $group: {
            _id: "$engine",
            totalRequests: { $sum: "$requestCount" },
            avgResponseTime: { $avg: "$avgResponseTimeMs" },
            avgCacheHitRate: { $avg: "$cacheHitRate" },
            avgConfidence: { $avg: "$avgClassificationConfidence" },
            urls: { $addToSet: "$canonicalUrl" },
          },
        },
        {
          $project: {
            engine: "$_id",
            _id: 0,
            totalRequests: 1,
            avgResponseTime: { $round: ["$avgResponseTime", 0] },
            avgCacheHitRate: { $round: ["$avgCacheHitRate", 2] },
            avgConfidence: { $round: ["$avgConfidence", 2] },
            uniquePages: { $size: "$urls" },
          },
        },
        { $sort: { totalRequests: -1 as const } },
      ];

      result.engines = await AgentAggregate.aggregate(enginePipeline);
    }

    // ── Top Pages by AI Interaction ────────────────────────────────
    if (section === "all" || section === "pages") {
      const pagesPipeline = [
        { $match: aggMatch },
        {
          $group: {
            _id: "$canonicalUrl",
            totalRequests: { $sum: "$requestCount" },
            avgResponseTime: { $avg: "$avgResponseTimeMs" },
            avgCacheHitRate: { $avg: "$cacheHitRate" },
            engines: { $addToSet: "$engine" },
            firstSeen: { $min: "$date" },
            lastSeen: { $max: "$date" },
          },
        },
        {
          $project: {
            url: "$_id",
            _id: 0,
            totalRequests: 1,
            avgResponseTime: { $round: ["$avgResponseTime", 0] },
            avgCacheHitRate: { $round: ["$avgCacheHitRate", 2] },
            engineCount: { $size: "$engines" },
            engines: 1,
            firstSeen: 1,
            lastSeen: 1,
          },
        },
        { $sort: { totalRequests: -1 as const } },
        { $limit: 50 },
      ];

      const topPages = await AgentAggregate.aggregate(pagesPipeline);

      // Enrich with Page model data (title, pageType, aiVisibilityScore)
      const urls = topPages.map((p: { url: string }) => p.url);
      const pageDetails = await Page.find(
        { tenantId: workspaceId, canonicalUrl: { $in: urls } },
        { canonicalUrl: 1, title: 1, pageType: 1, aiVisibilityScore: 1, contentEffectivenessScore: 1 }
      ).lean();

      const pageMap = new Map(pageDetails.map((p) => [p.canonicalUrl, p]));

      result.pages = topPages.map((p: Record<string, unknown>) => {
        const detail = pageMap.get(p.url as string);
        return {
          ...p,
          title: detail?.title || "",
          pageType: detail?.pageType || "other",
          aiVisibilityScore: detail?.aiVisibilityScore || 0,
          contentEffectivenessScore: detail?.contentEffectivenessScore || 0,
        };
      });
    }

    // ── Geographic Distribution ────────────────────────────────────
    if (section === "all" || section === "geo") {
      const geoPipeline = [
        { $match: aggMatch },
        {
          $project: {
            countries: { $objectToArray: "$topCountries" },
            requestCount: 1,
          },
        },
        { $unwind: "$countries" },
        {
          $group: {
            _id: "$countries.k",
            totalRequests: { $sum: "$countries.v" },
          },
        },
        {
          $project: {
            country: "$_id",
            _id: 0,
            totalRequests: 1,
          },
        },
        { $sort: { totalRequests: -1 as const } },
        { $limit: 30 },
      ];

      result.geo = await AgentAggregate.aggregate(geoPipeline);
    }

    // ── Purpose Breakdown ──────────────────────────────────────────
    if (section === "all" || section === "purposes") {
      const purposePipeline = [
        { $match: aggMatch },
        {
          $project: {
            purposes: { $objectToArray: "$purposeBreakdown" },
            requestCount: 1,
          },
        },
        { $unwind: "$purposes" },
        {
          $group: {
            _id: "$purposes.k",
            totalRequests: { $sum: "$purposes.v" },
          },
        },
        {
          $project: {
            purpose: "$_id",
            _id: 0,
            totalRequests: 1,
          },
        },
        { $sort: { totalRequests: -1 as const } },
      ];

      result.purposes = await AgentAggregate.aggregate(purposePipeline);
    }

    // ── Live Crawler Log (recent raw events) ───────────────────────
    if (section === "all" || section === "live") {
      const liveEvents = await AgentRequest.find(rawMatch)
        .sort({ timestamp: -1 })
        .limit(30)
        .lean();

      result.live = liveEvents.map((e) => ({
        id: e._id?.toString(),
        timestamp: e.timestamp,
        canonicalUrl: e.canonicalUrl,
        engine: e.engine,
        agentPurpose: e.agentPurpose,
        statusCode: e.statusCode,
        responseTimeMs: e.responseTimeMs,
        cacheStatus: e.cacheStatus,
        country: e.country,
        classificationConfidence: e.classificationConfidence,
        userAgent: e.userAgent,
      }));
    }

    // ── Crawl Gap Detection (low-visibility pages) ─────────────────
    if (section === "all" || section === "pages") {
      const lowVisPages = await Page.find(
        {
          tenantId: workspaceId,
          totalAgentRequests: { $lte: 2 },
          canonicalUrl: { $exists: true, $ne: "" },
        },
        {
          canonicalUrl: 1,
          title: 1,
          pageType: 1,
          aiVisibilityScore: 1,
          totalAgentRequests: 1,
          lastAgentAccessAt: 1,
        }
      )
        .sort({ aiVisibilityScore: 1 })
        .limit(20)
        .lean();

      result.crawlGaps = lowVisPages.map((p) => ({
        url: p.canonicalUrl,
        title: p.title || "",
        pageType: p.pageType || "other",
        aiVisibilityScore: p.aiVisibilityScore || 0,
        totalAgentRequests: p.totalAgentRequests || 0,
        lastAgentAccessAt: p.lastAgentAccessAt || null,
      }));
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Agent analytics GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
