import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import AgentRequest from "@/models/AgentRequest";
import AgentAggregate from "@/models/AgentAggregate";
import Page from "@/models/Page";
import Workspace from "@/models/Workspace";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  POST /api/cron/agent-aggregates                                    */
/*                                                                     */
/*  Daily aggregation job — rolls up AgentRequest events into daily    */
/*  AgentAggregate records keyed by (tenantId, date, engine, url).     */
/*  Also recomputes Page.aiVisibilityScore and contentEffectiveness.   */
/*                                                                     */
/*  Should be called once per day (e.g. via Vercel Cron at 01:00 UTC). */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    // Aggregate yesterday's data by default, or accept a date param
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");

    const targetDate = dateParam ? new Date(dateParam) : new Date(Date.now() - 86400000);
    targetDate.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate.getTime() + 86400000);
    const dateStr = targetDate.toISOString().split("T")[0];

    // Get all workspace IDs
    const workspaces = await Workspace.find({}, { _id: 1 }).lean();
    const workspaceIds = workspaces.map((w) => w._id);

    let totalAggregates = 0;
    let totalPagesScored = 0;

    for (const tenantId of workspaceIds) {
      // Aggregation pipeline: group by engine + canonicalUrl
      const pipeline = [
        {
          $match: {
            tenantId,
            timestamp: { $gte: targetDate, $lt: nextDay },
          },
        },
        {
          $group: {
            _id: {
              engine: "$engine",
              canonicalUrl: "$canonicalUrl",
            },
            requestCount: { $sum: 1 },
            avgResponseTimeMs: { $avg: "$responseTimeMs" },
            avgConfidence: { $avg: "$classificationConfidence" },
            cacheHits: {
              $sum: {
                $cond: [{ $eq: ["$cacheStatus", "HIT"] }, 1, 0],
              },
            },
            countries: { $push: "$country" },
            purposes: { $push: "$agentPurpose" },
          },
        },
      ];

      const results = await AgentRequest.aggregate(pipeline);

      if (results.length === 0) continue;

      // Build upsert operations
      const ops = results.map((r: Record<string, unknown>) => {
        const _id = r._id as { engine: string; canonicalUrl: string };
        const countries = (r.countries as string[]) || [];
        const purposes = (r.purposes as string[]) || [];

        // Count top countries
        const countryMap: Record<string, number> = {};
        for (const c of countries) {
          if (c) countryMap[c] = (countryMap[c] || 0) + 1;
        }

        // Count purpose breakdown
        const purposeMap: Record<string, number> = {};
        for (const p of purposes) {
          purposeMap[p] = (purposeMap[p] || 0) + 1;
        }

        const count = r.requestCount as number;

        return {
          updateOne: {
            filter: {
              tenantId,
              date: dateStr,
              engine: _id.engine,
              canonicalUrl: _id.canonicalUrl,
            },
            update: {
              $set: {
                requestCount: count,
                uniquePages: 1, // 1 URL per record
                avgResponseTimeMs: Math.round(r.avgResponseTimeMs as number),
                cacheHitRate: count > 0 ? (r.cacheHits as number) / count : 0,
                topCountries: countryMap,
                purposeBreakdown: purposeMap,
                avgClassificationConfidence: r.avgConfidence as number,
              },
            },
            upsert: true,
          },
        };
      });

      if (ops.length > 0) {
        await AgentAggregate.bulkWrite(ops);
        totalAggregates += ops.length;
      }

      // --- Recompute Page scores for this workspace ---
      // Get last 30 days of aggregates for scoring
      const thirtyDaysAgo = new Date(targetDate.getTime() - 30 * 86400000);
      const recentAggs = await AgentAggregate.find({
        tenantId,
        date: { $gte: thirtyDaysAgo.toISOString().split("T")[0] },
      }).lean();

      // Group by canonicalUrl
      const pageScores: Map<
        string,
        { totalRequests: number; engineWeights: number; recencySum: number }
      > = new Map();

      // Engine authority weights for scoring
      const engineAuthority: Record<string, number> = {
        chatgpt: 1.0,
        gemini: 0.9,
        claude: 0.8,
        perplexity: 0.7,
        bing: 0.6,
        deepseek: 0.5,
        meta: 0.4,
        apple: 0.5,
        unknown: 0.3,
      };

      for (const agg of recentAggs) {
        const url = agg.canonicalUrl || "";
        if (!url) continue;

        const existing = pageScores.get(url) || {
          totalRequests: 0,
          engineWeights: 0,
          recencySum: 0,
        };

        const daysAgo =
          (targetDate.getTime() - new Date(agg.date).getTime()) / 86400000;
        const recencyFactor = Math.max(0, 1 - daysAgo / 30); // Linear decay over 30 days

        existing.totalRequests += agg.requestCount;
        existing.engineWeights +=
          agg.requestCount * (engineAuthority[agg.engine] || 0.3) * recencyFactor;
        existing.recencySum += recencyFactor;

        pageScores.set(url, existing);
      }

      // Update Page documents
      const pageOps = Array.from(pageScores.entries()).map(([url, scores]) => {
        // Normalise visibility score to 0–100
        // Using log scale: score = min(100, 20 * log2(1 + weightedSum))
        const rawVis = scores.engineWeights;
        const aiVisibilityScore = Math.min(100, Math.round(20 * Math.log2(1 + rawVis)));

        // Content effectiveness: combination of visibility + structural signals
        // (structural signals would need page analysis — for now base on visibility)
        const contentEffectivenessScore = Math.min(
          100,
          Math.round(aiVisibilityScore * 0.7 + 30 * (scores.totalRequests > 10 ? 1 : scores.totalRequests / 10))
        );

        return {
          updateOne: {
            filter: { tenantId, canonicalUrl: url },
            update: {
              $set: {
                aiVisibilityScore,
                contentEffectivenessScore,
                totalAgentRequests: scores.totalRequests,
              },
            },
          },
        };
      });

      if (pageOps.length > 0) {
        await Page.bulkWrite(pageOps);
        totalPagesScored += pageOps.length;
      }
    }

    return NextResponse.json({
      success: true,
      date: dateStr,
      workspacesProcessed: workspaceIds.length,
      aggregatesWritten: totalAggregates,
      pagesScored: totalPagesScored,
    });
  } catch (error) {
    console.error("Agent aggregation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
