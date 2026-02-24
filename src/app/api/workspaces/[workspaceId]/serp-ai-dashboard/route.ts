import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/serp-ai-dashboard
 *
 * Combined SERP + AI Visibility Analytics —
 * Merges organic search & AI overview metrics into a single dashboard view.
 */
export async function GET(
  _req: Request,
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

    const queries = (await Query.find({ tenantId: workspaceId }).lean()) as unknown as Array<
      Record<string, unknown>
    >;

    const results = (await TrackingResult.find({ tenantId: workspaceId })
      .sort({ fetchedAt: -1 })
      .lean()) as unknown as Array<Record<string, unknown>>;

    // Build per-query combined metrics
    const queryMetrics = queries.map((q) => {
      const qId = String(q._id);
      const qResults = results.filter((r) => String(r.queryId) === qId);

      // Split by engine type
      const aiResults = qResults.filter((r) =>
        ["google_ai_overview", "bing_chat", "perplexity", "chatgpt"].includes(
          r.engine as string
        )
      );
      const serpResults = qResults.filter(
        (r) => (r.engine as string) === "google" || !(r.engine as string)
      );

      // AI metrics — use brandTextVisibility (brand name in AI text) instead of isBrandMentioned (domain citation)
      const aiVisScores = aiResults.map((r) => (r.brandTextVisibility as number) || 0);
      const aiTotal = aiResults.length;
      const aiVisibility = aiTotal > 0 ? Math.round(aiVisScores.reduce((a, b) => a + b, 0) / aiTotal) : 0;
      const aiBrandMentions = aiResults.filter((r) => ((r.brandTextVisibility as number) || 0) > 0).length;

      // SERP metrics (using sourcePosition as organic rank proxy)
      const positions = serpResults
        .map((r) => r.sourcePosition as number)
        .filter((p) => p && p > 0);
      const avgPosition =
        positions.length > 0
          ? Math.round(
              (positions.reduce((a, b) => a + b, 0) / positions.length) * 10
            ) / 10
          : null;

      // Sentiment distribution from AI results
      const sentiments: Record<string, number> = {};
      for (const r of aiResults) {
        const s = (r.sentiment as string) || "neutral";
        sentiments[s] = (sentiments[s] || 0) + 1;
      }

      return {
        queryId: qId,
        queryText: q.queryText as string,
        searchVolume: (q.searchVolume as number) || 0,
        aiVisibility,
        aiBrandMentions,
        aiTotal,
        avgSerpPosition: avgPosition,
        serpResults: serpResults.length,
        sentiments,
        engines: [...new Set(qResults.map((r) => r.engine as string))],
      };
    });

    // Time series: daily combined metrics (last 30 days)
    const now = Date.now();
    const timeSeries: Array<{
      date: string;
      aiVisibility: number;
      serpCoverage: number;
      totalResults: number;
    }> = [];

    for (let d = 29; d >= 0; d--) {
      const dayStart = new Date(now - d * 86400000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayResults = results.filter((r) => {
        const t = new Date(r.fetchedAt as string).getTime();
        return t >= dayStart.getTime() && t <= dayEnd.getTime();
      });

      const dayAi = dayResults.filter((r) =>
        ["google_ai_overview", "bing_chat", "perplexity", "chatgpt"].includes(
          r.engine as string
        )
      );
      const dayBrand = dayAi.reduce((sum, r) => sum + ((r.brandTextVisibility as number) || 0), 0);
      const aiVis = dayAi.length > 0 ? Math.round(dayBrand / dayAi.length) : 0;

      // SERP coverage = % of queries with at least one organic result
      const queriesWithSerp = new Set(
        dayResults
          .filter(
            (r) => (r.engine as string) === "google" || !(r.engine as string)
          )
          .map((r) => String(r.queryId))
      );
      const serpCov =
        queries.length > 0
          ? Math.round((queriesWithSerp.size / queries.length) * 100)
          : 0;

      timeSeries.push({
        date: dayStart.toISOString().split("T")[0],
        aiVisibility: aiVis,
        serpCoverage: serpCov,
        totalResults: dayResults.length,
      });
    }

    // Engine breakdown
    const engineBreakdown: Record<string, { total: number; branded: number }> = {};
    for (const r of results) {
      const engine = (r.engine as string) || "unknown";
      if (!engineBreakdown[engine]) engineBreakdown[engine] = { total: 0, branded: 0 };
      engineBreakdown[engine].total += 1;
      if (((r.brandTextVisibility as number) || 0) > 0) engineBreakdown[engine].branded += 1;
    }

    const overallAiVis =
      results.length > 0
        ? Math.round(
            results.reduce((sum, r) => sum + ((r.brandTextVisibility as number) || 0), 0) / results.length
          )
        : 0;

    return NextResponse.json({
      queryMetrics: queryMetrics.sort(
        (a, b) => b.aiVisibility - a.aiVisibility
      ),
      timeSeries,
      engineBreakdown,
      summary: {
        totalQueries: queries.length,
        totalResults: results.length,
        overallAiVisibility: overallAiVis,
        queriesWithAiPresence: queryMetrics.filter((q) => q.aiVisibility > 0).length,
      },
    });
  } catch (error) {
    console.error("SERP+AI dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
