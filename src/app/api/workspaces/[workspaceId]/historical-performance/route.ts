import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/historical-performance
 *
 * Historical Prompt/Query Performance Tracker —
 * per-query daily time series of visibility, sentiment, position, and source counts,
 * with trend analysis and milestone detection.
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

    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") || "90");
    const queryId = url.searchParams.get("queryId") || undefined;

    const since = new Date(Date.now() - days * 86400000);

    const resultFilter: Record<string, unknown> = {
      tenantId: workspaceId,
      fetchedAt: { $gte: since },
    };
    if (queryId) {
      resultFilter.queryId = queryId;
    }

    const queries = (await Query.find({ tenantId: workspaceId }).lean()) as unknown as Array<
      Record<string, unknown>
    >;

    const results = (await TrackingResult.find(resultFilter)
      .sort({ fetchedAt: 1 })
      .lean()) as unknown as Array<Record<string, unknown>>;

    // Build per-query historical data
    const queryHistory = queries
      .filter((q) => !queryId || String(q._id) === queryId)
      .map((q) => {
        const qId = String(q._id);
        const qResults = results.filter((r) => String(r.queryId) === qId);

        // Daily aggregation
        const dailyMap = new Map<
          string,
          {
            total: number;
            branded: number;
            sentiments: Record<string, number>;
            positions: number[];
            sources: Set<string>;
          }
        >();

        for (const r of qResults) {
          const day = new Date(r.fetchedAt as string).toISOString().split("T")[0];
          const existing = dailyMap.get(day) || {
            total: 0,
            branded: 0,
            sentiments: {},
            positions: [],
            sources: new Set<string>(),
          };

          existing.total += 1;
          if (r.isBrandMentioned) existing.branded += 1;
          const s = (r.sentiment as string) || "neutral";
          existing.sentiments[s] = (existing.sentiments[s] || 0) + 1;
          if (r.sourcePosition) existing.positions.push(r.sourcePosition as number);
          if (r.sourceUrl) existing.sources.add(r.sourceUrl as string);

          dailyMap.set(day, existing);
        }

        const dailySeries = Array.from(dailyMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, data]) => ({
            date,
            visibility: data.total > 0 ? Math.round((data.branded / data.total) * 100) : 0,
            totalResults: data.total,
            brandMentions: data.branded,
            avgPosition:
              data.positions.length > 0
                ? Math.round(
                    (data.positions.reduce((a, b) => a + b, 0) / data.positions.length) * 10
                  ) / 10
                : null,
            uniqueSources: data.sources.size,
            sentiments: data.sentiments,
          }));

        // Detect milestones (significant changes)
        const milestones: Array<{
          date: string;
          type: "visibility_spike" | "visibility_drop" | "new_source" | "sentiment_shift";
          description: string;
        }> = [];

        for (let i = 1; i < dailySeries.length; i++) {
          const prev = dailySeries[i - 1];
          const curr = dailySeries[i];

          if (curr.visibility - prev.visibility >= 30) {
            milestones.push({
              date: curr.date,
              type: "visibility_spike",
              description: `Visibility jumped from ${prev.visibility}% to ${curr.visibility}%`,
            });
          }
          if (prev.visibility - curr.visibility >= 30) {
            milestones.push({
              date: curr.date,
              type: "visibility_drop",
              description: `Visibility dropped from ${prev.visibility}% to ${curr.visibility}%`,
            });
          }
        }

        // Overall trend
        const firstHalf = dailySeries.slice(0, Math.floor(dailySeries.length / 2));
        const secondHalf = dailySeries.slice(Math.floor(dailySeries.length / 2));
        const firstAvg =
          firstHalf.length > 0
            ? firstHalf.reduce((sum, d) => sum + d.visibility, 0) / firstHalf.length
            : 0;
        const secondAvg =
          secondHalf.length > 0
            ? secondHalf.reduce((sum, d) => sum + d.visibility, 0) / secondHalf.length
            : 0;
        const trend = secondAvg > firstAvg + 5 ? "up" : secondAvg < firstAvg - 5 ? "down" : "stable";

        return {
          queryId: qId,
          queryText: q.queryText as string,
          dailySeries,
          milestones,
          trend,
          currentVisibility: dailySeries[dailySeries.length - 1]?.visibility || 0,
          totalDataPoints: qResults.length,
        };
      });

    return NextResponse.json({
      queries: queryHistory.sort((a, b) => b.totalDataPoints - a.totalDataPoints),
      period: { days, since: since.toISOString() },
    });
  } catch (error) {
    console.error("Historical performance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
