import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Workspace from "@/models/Workspace";
import TrackingResult from "@/models/TrackingResult";
import Competitor from "@/models/Competitor";
import Query from "@/models/Query";
import mongoose from "mongoose";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  GET /api/workspaces/[workspaceId]/sov-sentiment/entity/[entity]    */
/*                                                                     */
/*  Entity detail — per-entity trend, sentiment by topic, top          */
/*  exemplar responses, top citation domains.                          */
/*                                                                     */
/*  Query params:                                                      */
/*    from  — ISO date start  (default 90 days ago)                    */
/*    to    — ISO date end    (default today)                          */
/* ------------------------------------------------------------------ */

export async function GET(
  req: Request,
  {
    params,
  }: { params: Promise<{ workspaceId: string; entity: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, entity: entityDomain } = await params;
    const decodedEntity = decodeURIComponent(entityDomain);
    await connectToDatabase();

    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const fromDate = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : new Date(now.getTime() - 90 * 86400000);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : now;

    const workspace = (await Workspace.findById(workspaceId).lean()) as unknown as Record<
      string,
      unknown
    >;
    const brandDomain = (workspace?.domain as string) || "";
    const isBrand = decodedEntity === brandDomain;

    // Resolve entity name
    let entityName = "Your Brand";
    if (!isBrand) {
      const comp = (await Competitor.findOne({
        tenantId: workspaceId,
        domain: decodedEntity,
      }).lean()) as unknown as Record<string, unknown> | null;
      entityName = (comp?.name as string) || decodedEntity;
    }

    // Fetch matching results for this entity
    const allResults = (await TrackingResult.find({
      tenantId: new mongoose.Types.ObjectId(workspaceId),
      fetchedAt: { $gte: fromDate, $lte: toDate },
    })
      .sort({ fetchedAt: 1 })
      .lean()) as unknown as Array<Record<string, unknown>>;

    const entityResults = allResults.filter((r) => {
      if (isBrand) return ((r.brandTextVisibility as number) || 0) > 0;
      const cd = (r.competitorDomain as string) || "";
      const su = (r.sourceUrl as string) || "";
      const ot = (r.overviewText as string) || "";
      return (
        cd.includes(decodedEntity) ||
        su.includes(decodedEntity) ||
        ot.toLowerCase().includes(decodedEntity.toLowerCase())
      );
    });

    // Daily trend for this entity
    const dailyMap = new Map<
      string,
      { positive: number; neutral: number; negative: number; total: number }
    >();
    for (const r of entityResults) {
      const d = new Date(r.fetchedAt as string).toISOString().split("T")[0];
      if (!dailyMap.has(d))
        dailyMap.set(d, { positive: 0, neutral: 0, negative: 0, total: 0 });
      const bucket = dailyMap.get(d)!;
      const s = (r.sentiment as string) || "neutral";
      bucket[s as "positive" | "neutral" | "negative"]++;
      bucket.total++;
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        positive: v.positive,
        neutral: v.neutral,
        negative: v.negative,
        total: v.total,
      }));

    // Sentiment by topic
    const queryIds = [
      ...new Set(entityResults.map((r) => String(r.queryId))),
    ];
    const queries = (await Query.find({
      _id: {
        $in: queryIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    })
      .select("_id topic queryText")
      .lean()) as unknown as Array<{
      _id: mongoose.Types.ObjectId;
      topic: string;
      queryText: string;
    }>;

    const queryTopicMap = new Map<string, string>();
    for (const q of queries) {
      queryTopicMap.set(String(q._id), q.topic || "Uncategorized");
    }

    const topicMap = new Map<
      string,
      { positive: number; neutral: number; negative: number; total: number }
    >();
    for (const r of entityResults) {
      const topic =
        queryTopicMap.get(String(r.queryId)) || "Uncategorized";
      if (!topicMap.has(topic))
        topicMap.set(topic, { positive: 0, neutral: 0, negative: 0, total: 0 });
      const bucket = topicMap.get(topic)!;
      const s = (r.sentiment as string) || "neutral";
      bucket[s as "positive" | "neutral" | "negative"]++;
      bucket.total++;
    }

    const topicBreakdown = Array.from(topicMap.entries())
      .map(([topic, v]) => ({
        topic,
        ...v,
        netSentiment:
          v.total > 0
            ? Math.round(((v.positive - v.negative) / v.total) * 100)
            : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Top exemplar responses (most recent with sentiment)
    const exemplarResponses = entityResults
      .filter((r) => r.contentSnippet || r.overviewText)
      .slice(-10)
      .reverse()
      .map((r) => ({
        sentiment: (r.sentiment as string) || "neutral",
        snippet: ((r.contentSnippet as string) || "").slice(0, 300),
        overviewExcerpt: ((r.overviewText as string) || "").slice(0, 500),
        engine: (r.engine as string) || "unknown",
        date: new Date(r.fetchedAt as string).toISOString().split("T")[0],
        sourceUrl: (r.sourceUrl as string) || "",
      }));

    // Top citation domains
    const domainCounts = new Map<string, number>();
    for (const r of entityResults) {
      const url = (r.sourceUrl as string) || "";
      if (!url) continue;
      try {
        const domain = new URL(url).hostname.replace("www.", "");
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      } catch {
        // skip invalid URLs
      }
    }

    const topCitationDomains = Array.from(domainCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Overall stats
    let pos = 0,
      neu = 0,
      neg = 0;
    for (const r of entityResults) {
      const s = (r.sentiment as string) || "neutral";
      if (s === "positive") pos++;
      else if (s === "negative") neg++;
      else neu++;
    }

    return NextResponse.json({
      entity: {
        name: entityName,
        domain: decodedEntity,
        isBrand,
        totalMentions: entityResults.length,
        positive: pos,
        neutral: neu,
        negative: neg,
        netSentiment:
          entityResults.length > 0
            ? Math.round(
                ((pos - neg) / entityResults.length) * 100
              )
            : 0,
      },
      dailyTrend,
      topicBreakdown,
      exemplarResponses,
      topCitationDomains,
    });
  } catch (error) {
    console.error("Entity sentiment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
