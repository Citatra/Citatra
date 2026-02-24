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
/*  GET /api/workspaces/[workspaceId]/sov-sentiment                    */
/*                                                                     */
/*  Brand Sentiment Dashboard — returns:                               */
/*    overview KPIs, daily sentiment trend, per-engine breakdown,      */
/*    per-topic sentiment, top prompts, and entity comparison.         */
/*                                                                     */
/*  Query params:                                                      */
/*    from    — ISO date start  (default 90 days ago)                  */
/*    to      — ISO date end    (default today)                        */
/*    engine  — optional engine filter                                 */
/*    topic   — optional topic filter                                  */
/*    entity  — optional entity filter                                 */
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
    const now = new Date();
    const fromDate = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : new Date(now.getTime() - 90 * 86400000);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : now;
    const engineFilter = searchParams.get("engine") || undefined;
    const topicFilter = searchParams.get("topic") || undefined;
    const entityFilter = searchParams.get("entity") || undefined;

    const workspace = (await Workspace.findById(workspaceId).lean()) as unknown as Record<
      string,
      unknown
    >;
    const brandDomain = (workspace?.domain as string) || "";
    const brandName = (workspace?.name as string) || "Your Brand";

    const competitors = (await Competitor.find({ tenantId: workspaceId }).lean()) as unknown as Array<
      Record<string, unknown>
    >;

    // Build entity list: brand + competitors
    const entities = [
      { name: brandName, domain: brandDomain, color: "#3b82f6", isBrand: true },
      ...competitors.map((c) => ({
        name: (c.name as string) || (c.domain as string) || "",
        domain: (c.domain as string) || "",
        color: (c.color as string) || "#6b7280",
        isBrand: false,
      })),
    ];

    // ── Fetch tracking results ─────────────────────────────────────
    const resultMatch: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(workspaceId),
      fetchedAt: { $gte: fromDate, $lte: toDate },
    };
    if (engineFilter) resultMatch.engine = engineFilter;

    // Get query IDs for optional topic filter
    let queryIdFilter: mongoose.Types.ObjectId[] | undefined;
    if (topicFilter) {
      const topicQueries = await Query.find({
        tenantId: workspaceId,
        topic: topicFilter,
        status: "active",
      })
        .select("_id")
        .lean();
      queryIdFilter = topicQueries.map(
        (q) =>
          (q as unknown as Record<string, unknown>)
            ._id as mongoose.Types.ObjectId
      );
      resultMatch.queryId = { $in: queryIdFilter };
    }

    const results = (await TrackingResult.find(resultMatch)
      .sort({ fetchedAt: 1 })
      .lean()) as unknown as Array<Record<string, unknown>>;

    // ── Helper: check if a result mentions a given entity ──────────
    function mentionsEntity(
      r: Record<string, unknown>,
      ent: { domain: string; isBrand: boolean }
    ): boolean {
      if (ent.isBrand) return ((r.brandTextVisibility as number) || 0) > 0;
      const cd = (r.competitorDomain as string) || "";
      const su = (r.sourceUrl as string) || "";
      const ot = (r.overviewText as string) || "";
      return (
        cd.includes(ent.domain) ||
        su.includes(ent.domain) ||
        ot.toLowerCase().includes(ent.domain.toLowerCase())
      );
    }

    // ── 1) Overview KPIs ───────────────────────────────────────────
    const totalMentions = results.length;
    let positiveCount = 0;
    let neutralCount = 0;
    let negativeCount = 0;

    for (const r of results) {
      const s = (r.sentiment as string) || "neutral";
      if (s === "positive") positiveCount++;
      else if (s === "negative") negativeCount++;
      else neutralCount++;
    }

    const positivePercent =
      totalMentions > 0
        ? Math.round((positiveCount / totalMentions) * 100)
        : 0;
    const negativePercent =
      totalMentions > 0
        ? Math.round((negativeCount / totalMentions) * 100)
        : 0;
    const neutralPercent =
      totalMentions > 0 ? 100 - positivePercent - negativePercent : 0;
    const netSentiment = positivePercent - negativePercent;

    // ── 2) Entity comparison ──────────────────────────────────────
    const filteredEntities = entityFilter
      ? entities.filter(
          (e) => e.domain === entityFilter || e.name === entityFilter
        )
      : entities;

    const entityComparison = filteredEntities.map((ent) => {
      const entResults = results.filter((r) => mentionsEntity(r, ent));
      const m = entResults.length;
      let pos = 0,
        neu = 0,
        neg = 0;
      for (const r of entResults) {
        const s = (r.sentiment as string) || "neutral";
        if (s === "positive") pos++;
        else if (s === "negative") neg++;
        else neu++;
      }
      return {
        name: ent.name,
        domain: ent.domain,
        color: ent.color,
        isBrand: ent.isBrand,
        mentions: m,
        sov: totalMentions > 0 ? Math.round((m / totalMentions) * 100) : 0,
        positive: pos,
        neutral: neu,
        negative: neg,
        positivePercent: m > 0 ? Math.round((pos / m) * 100) : 0,
        negativePercent: m > 0 ? Math.round((neg / m) * 100) : 0,
        netSentiment:
          m > 0 ? Math.round(((pos - neg) / m) * 100) : 0,
      };
    });

    // ── 3) Daily sentiment trend ──────────────────────────────────
    const dailyMap = new Map<
      string,
      {
        positive: number;
        neutral: number;
        negative: number;
        total: number;
      }
    >();

    for (const r of results) {
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
        positiveShare:
          v.total > 0 ? Math.round((v.positive / v.total) * 100) : 0,
        negativeShare:
          v.total > 0 ? Math.round((v.negative / v.total) * 100) : 0,
      }));

    // ── 4) Per-engine breakdown ───────────────────────────────────
    const engineMap = new Map<
      string,
      {
        positive: number;
        neutral: number;
        negative: number;
        total: number;
      }
    >();

    for (const r of results) {
      const eng = (r.engine as string) || "unknown";
      if (!engineMap.has(eng))
        engineMap.set(eng, { positive: 0, neutral: 0, negative: 0, total: 0 });
      const bucket = engineMap.get(eng)!;
      const s = (r.sentiment as string) || "neutral";
      bucket[s as "positive" | "neutral" | "negative"]++;
      bucket.total++;
    }

    const engineBreakdown = Array.from(engineMap.entries()).map(
      ([engine, v]) => ({
        engine,
        positive: v.positive,
        neutral: v.neutral,
        negative: v.negative,
        total: v.total,
        netSentiment:
          v.total > 0
            ? Math.round(((v.positive - v.negative) / v.total) * 100)
            : 0,
      })
    );

    // ── 5) Per-topic sentiment (top themes) ────────────────────────
    const queryIds = [
      ...new Set(results.map((r) => String(r.queryId))),
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
    const queryTextMap = new Map<string, string>();
    for (const q of queries) {
      queryTopicMap.set(String(q._id), q.topic || "Uncategorized");
      queryTextMap.set(String(q._id), q.queryText || "Unknown prompt");
    }

    const topicMap = new Map<
      string,
      {
        positive: number;
        neutral: number;
        negative: number;
        total: number;
      }
    >();

    for (const r of results) {
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
        positive: v.positive,
        neutral: v.neutral,
        negative: v.negative,
        total: v.total,
        netSentiment:
          v.total > 0
            ? Math.round(((v.positive - v.negative) / v.total) * 100)
            : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // ── 6) Top moving themes (biggest sentiment change 7d) ─────────
    const weekAgo = new Date(toDate.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(toDate.getTime() - 14 * 86400000);

    function computeTopicSentiment(
      periodResults: Array<Record<string, unknown>>
    ): Map<string, { pos: number; neg: number; total: number }> {
      const m = new Map<
        string,
        { pos: number; neg: number; total: number }
      >();
      for (const r of periodResults) {
        const t =
          queryTopicMap.get(String(r.queryId)) || "Uncategorized";
        if (!m.has(t)) m.set(t, { pos: 0, neg: 0, total: 0 });
        const b = m.get(t)!;
        const s = (r.sentiment as string) || "neutral";
        if (s === "positive") b.pos++;
        else if (s === "negative") b.neg++;
        b.total++;
      }
      return m;
    }

    const recentResults = results.filter(
      (r) =>
        new Date(r.fetchedAt as string).getTime() >= weekAgo.getTime()
    );
    const prevResults = results.filter((r) => {
      const t = new Date(r.fetchedAt as string).getTime();
      return t >= twoWeeksAgo.getTime() && t < weekAgo.getTime();
    });

    const recentTopics = computeTopicSentiment(recentResults);
    const prevTopics = computeTopicSentiment(prevResults);

    const topMovingThemes: Array<{
      topic: string;
      currentNet: number;
      previousNet: number;
      change: number;
    }> = [];

    for (const [topic, cur] of recentTopics.entries()) {
      const prev = prevTopics.get(topic);
      const currentNet =
        cur.total > 0
          ? Math.round(((cur.pos - cur.neg) / cur.total) * 100)
          : 0;
      const prevNet =
        prev && prev.total > 0
          ? Math.round(((prev.pos - prev.neg) / prev.total) * 100)
          : 0;
      topMovingThemes.push({
        topic,
        currentNet,
        previousNet: prevNet,
        change: currentNet - prevNet,
      });
    }

    topMovingThemes.sort(
      (a, b) => Math.abs(b.change) - Math.abs(a.change)
    );

    // ── 7) Top prompts driving sentiment ──────────────────────────
    const promptSentimentMap = new Map<
      string,
      {
        queryId: string;
        queryText: string;
        positive: number;
        neutral: number;
        negative: number;
        total: number;
        sampleSnippets: string[];
      }
    >();

    for (const r of results) {
      const qId = String(r.queryId);
      if (!promptSentimentMap.has(qId)) {
        promptSentimentMap.set(qId, {
          queryId: qId,
          queryText: queryTextMap.get(qId) || "Unknown prompt",
          positive: 0,
          neutral: 0,
          negative: 0,
          total: 0,
          sampleSnippets: [],
        });
      }
      const b = promptSentimentMap.get(qId)!;
      const s = (r.sentiment as string) || "neutral";
      b[s as "positive" | "neutral" | "negative"]++;
      b.total++;
      if (
        b.sampleSnippets.length < 3 &&
        (r.contentSnippet as string)
      ) {
        const snippet = (r.contentSnippet as string).slice(0, 200);
        if (snippet) b.sampleSnippets.push(snippet);
      }
    }

    const topPrompts = Array.from(promptSentimentMap.values())
      .map((p) => ({
        ...p,
        netSentiment:
          p.total > 0
            ? Math.round(((p.positive - p.negative) / p.total) * 100)
            : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    // ── 8) Weekly SoV trend (12 weeks) ────────────────────────────
    const weeklyData: Array<{
      week: string;
      entities: Array<{
        name: string;
        sov: number;
        sentiment: {
          positive: number;
          neutral: number;
          negative: number;
        };
      }>;
    }> = [];

    for (let w = 11; w >= 0; w--) {
      const weekStart = new Date(
        toDate.getTime() - (w + 1) * 7 * 86400000
      );
      const weekEnd = new Date(toDate.getTime() - w * 7 * 86400000);

      const weekResults = results.filter((r) => {
        const t = new Date(r.fetchedAt as string).getTime();
        return t >= weekStart.getTime() && t < weekEnd.getTime();
      });

      const weekTotal = weekResults.length;
      const weekEntities = entities.map((ent) => {
        const entResults = weekResults.filter((r) =>
          mentionsEntity(r, ent)
        );
        let pos = 0,
          neu = 0,
          neg = 0;
        for (const r of entResults) {
          const s = (r.sentiment as string) || "neutral";
          if (s === "positive") pos++;
          else if (s === "negative") neg++;
          else neu++;
        }
        return {
          name: ent.name,
          sov:
            weekTotal > 0
              ? Math.round((entResults.length / weekTotal) * 100)
              : 0,
          sentiment: { positive: pos, neutral: neu, negative: neg },
        };
      });

      weeklyData.push({
        week: weekStart.toISOString().split("T")[0],
        entities: weekEntities,
      });
    }

    // ── Available filter values ────────────────────────────────────
    const availableEngines = [
      ...new Set(
        results.map((r) => (r.engine as string) || "unknown")
      ),
    ];
    const availableTopics = [
      ...new Set(queries.map((q) => q.topic).filter(Boolean)),
    ].sort();

    // ── Response ───────────────────────────────────────────────────
    return NextResponse.json({
      overview: {
        totalMentions,
        positiveCount,
        neutralCount,
        negativeCount,
        positivePercent,
        neutralPercent,
        negativePercent,
        netSentiment,
        entitiesTracked: entities.length,
      },
      entityComparison: entityComparison.sort(
        (a, b) => b.sov - a.sov
      ),
      dailyTrend,
      engineBreakdown,
      topicBreakdown,
      topMovingThemes: topMovingThemes.slice(0, 10),
      topPrompts,
      weeklyTrend: weeklyData,
      filters: {
        engines: availableEngines,
        topics: availableTopics,
        entities: entities.map((e) => ({
          name: e.name,
          domain: e.domain,
        })),
      },
    });
  } catch (error) {
    console.error("Brand sentiment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
