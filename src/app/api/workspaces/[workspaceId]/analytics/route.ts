import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import TrackingResult from "@/models/TrackingResult";
import Query from "@/models/Query";
import Membership from "@/models/Membership";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/analytics
 *
 * Provides time-series and aggregate analytics data for the dashboard charts.
 *
 * Query params:
 *   - days (default: 30): number of days of history
 *   - type: "mentions-over-time" | "sentiment" | "sources" | "overview"
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
    const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") || "30")));
    const since = new Date();
    since.setDate(since.getDate() - days);

    // ---- Mentions Over Time (daily aggregation) ----
    const mentionsOverTime = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: { $eq: new (await import("mongoose")).Types.ObjectId(workspaceId) },
          fetchedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$fetchedAt" } },
          },
          total: { $sum: 1 },
          brandMentions: {
            $sum: { $cond: ["$isBrandMentioned", 1, 0] },
          },
          brandTextVisibilitySum: {
            $sum: { $ifNull: ["$brandTextVisibility", 0] },
          },
          brandTextVisibilityCount: {
            $sum: { $cond: [{ $gt: [{ $ifNull: ["$brandTextVisibility", 0] }, 0] }, 1, 0] },
          },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // ---- Sentiment distribution ----
    const sentimentDist = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: { $eq: new (await import("mongoose")).Types.ObjectId(workspaceId) },
          fetchedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: "$sentiment",
          count: { $sum: 1 },
        },
      },
    ]);

    // ---- Top sources (domains appearing most) ----
    const topSources = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: { $eq: new (await import("mongoose")).Types.ObjectId(workspaceId) },
          fetchedAt: { $gte: since },
          sourceUrl: { $ne: "" },
        },
      },
      {
        $project: {
          // Extract hostname from sourceUrl
          sourceUrl: 1,
          isBrandMentioned: 1,
        },
      },
      {
        $group: {
          _id: "$sourceUrl",
          count: { $sum: 1 },
          brandMention: { $max: { $cond: ["$isBrandMentioned", true, false] } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // ---- Per-query performance ----
    const queryPerformance = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: { $eq: new (await import("mongoose")).Types.ObjectId(workspaceId) },
          fetchedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: "$queryId",
          totalResults: { $sum: 1 },
          brandMentions: {
            $sum: { $cond: ["$isBrandMentioned", 1, 0] },
          },
          avgBrandTextVisibility: {
            $avg: { $ifNull: ["$brandTextVisibility", 0] },
          },
          lastFetched: { $max: "$fetchedAt" },
        },
      },
      { $sort: { avgBrandTextVisibility: -1 } },
    ]);

    // Map queryIds to queryText
    const queryIds = queryPerformance.map((qp) => qp._id);
    const queries = await Query.find({ _id: { $in: queryIds } })
      .select("queryText")
      .lean();
    const queryMap = new Map(queries.map((q) => [q._id.toString(), q.queryText]));

    // ---- Visibility score over time (average brandTextVisibility per day) ----
    const visibilityScore = mentionsOverTime.map((d) => ({
      date: d._id.date,
      score: d.total > 0 ? Math.round(d.brandTextVisibilitySum / d.total) : 0,
      total: d.total,
      brandMentions: d.brandMentions,
      brandTextVisibilityAvg: d.total > 0 ? Math.round(d.brandTextVisibilitySum / d.total) : 0,
    }));

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      mentionsOverTime: mentionsOverTime.map((d) => ({
        date: d._id.date,
        total: d.total,
        brandMentions: d.brandMentions,
      })),
      visibilityScore,
      sentimentDistribution: sentimentDist.map((s) => ({
        sentiment: s._id || "unknown",
        count: s.count,
      })),
      topSources: topSources.map((s) => {
        let hostname = s._id;
        try {
          hostname = new URL(s._id).hostname;
        } catch {
          // keep as-is
        }
        return {
          url: s._id,
          hostname,
          count: s.count,
          isBrand: s.brandMention,
        };
      }),
      queryPerformance: queryPerformance.map((qp) => ({
        queryId: qp._id.toString(),
        queryText: queryMap.get(qp._id.toString()) || "Unknown",
        totalResults: qp.totalResults,
        brandMentions: qp.brandMentions,
        avgBrandTextVisibility: Math.round(qp.avgBrandTextVisibility || 0),
        visibilityRate:
          qp.totalResults > 0
            ? Math.round((qp.avgBrandTextVisibility || 0))
            : 0,
        lastFetched: qp.lastFetched,
      })),
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
