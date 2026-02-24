import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";
import Membership from "@/models/Membership";
import Competitor from "@/models/Competitor";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/stats
 *
 * Dashboard stats for a workspace:
 * - Total tracked queries (active)
 * - Queries appearing in AI Overviews (brand mentioned)
 * - Last fetch timestamp
 * - Recent results
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

    // Count queries
    const [totalQueries, activeQueries] = await Promise.all([
      Query.countDocuments({ tenantId: workspaceId }),
      Query.countDocuments({ tenantId: workspaceId, status: "active" }),
    ]);

    // Get the last fetch time across all queries
    const lastFetchedQuery = await Query.findOne({
      tenantId: workspaceId,
      lastFetchedAt: { $exists: true },
    })
      .sort({ lastFetchedAt: -1 })
      .lean();

    // Count unique queries that have brand text visibility > 0 (brand name appears in AI text)
    const brandVisibleQueryIds = await TrackingResult.distinct("queryId", {
      tenantId: workspaceId,
      brandTextVisibility: { $gt: 0 },
    });

    // Also keep old metric for domain citations
    const brandMentionQueryIds = await TrackingResult.distinct("queryId", {
      tenantId: workspaceId,
      isBrandMentioned: true,
    });

    // Total tracking results
    const totalResults = await TrackingResult.countDocuments({
      tenantId: workspaceId,
    });

    // Brand visibility: count of results where brand name was in the text
    const brandVisibleCount = await TrackingResult.countDocuments({
      tenantId: workspaceId,
      brandTextVisibility: { $gt: 0 },
    });

    // Average brand text visibility across all results
    const avgVisibilityAgg = await TrackingResult.aggregate([
      { $match: { tenantId: new (await import("mongoose")).Types.ObjectId(workspaceId) } },
      { $group: { _id: null, avg: { $avg: { $ifNull: ["$brandTextVisibility", 0] } } } },
    ]);
    const avgBrandTextVisibility = Math.round(avgVisibilityAgg[0]?.avg || 0);

    // Brand mention count (domain cited)
    const brandMentionCount = await TrackingResult.countDocuments({
      tenantId: workspaceId,
      isBrandMentioned: true,
    });

    // Recent results (last 10)
    const recentResults = await TrackingResult.find({
      tenantId: workspaceId,
    })
      .sort({ fetchedAt: -1 })
      .limit(10)
      .populate("queryId", "queryText")
      .lean();

    // Fetch sessions — count unique dates
    const fetchDates = await TrackingResult.distinct("fetchedAt", {
      tenantId: workspaceId,
    });
    // Group by day
    const uniqueDays = new Set(
      fetchDates.map((d: Date) => new Date(d).toISOString().split("T")[0])
    );

    // AI Coverage: % of active queries that have at least one AI Overview result
    const queriesWithResults = await TrackingResult.distinct("queryId", {
      tenantId: workspaceId,
    });
    const aiCoveragePercent = activeQueries > 0
      ? Math.round((queriesWithResults.length / activeQueries) * 100)
      : 0;

    // Share of Voice: based on brand text visibility (brand name in AI text)
    const brandShareOfVoice = totalResults > 0
      ? Math.round((brandVisibleCount / totalResults) * 100)
      : 0;

    // Competitor share of voice
    const competitors = await Competitor.find({ tenantId: workspaceId }).lean();
    const competitorSov: { name: string; domain: string; color: string; share: number }[] = [];
    if (competitors.length > 0) {
      for (const comp of competitors) {
        const compMentions = await TrackingResult.countDocuments({
          tenantId: workspaceId,
          competitorDomain: comp.domain,
        });
        competitorSov.push({
          name: comp.name,
          domain: comp.domain,
          color: comp.color || "#888888",
          share: totalResults > 0 ? Math.round((compMentions / totalResults) * 100) : 0,
        });
      }
    }

    return NextResponse.json({
      stats: {
        totalQueries,
        activeQueries,
        queriesWithBrandMentions: brandVisibleQueryIds.length,
        totalResults,
        brandMentionCount,
        brandVisibleCount,
        avgBrandTextVisibility,
        fetchSessions: uniqueDays.size,
        lastFetchedAt: lastFetchedQuery?.lastFetchedAt ?? null,
        aiCoveragePercent,
        brandShareOfVoice,
        competitorShareOfVoice: competitorSov,
      },
      recentResults: recentResults.map((r) => ({
        id: r._id.toString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        queryText: (r.queryId as any)?.queryText ?? "Unknown",
        contentSnippet: r.contentSnippet?.substring(0, 150),
        sourceUrl: r.sourceUrl,
        engine: r.engine,
        isBrandMentioned: r.isBrandMentioned,
        brandTextVisibility: r.brandTextVisibility ?? 0,
        mentionType: r.mentionType,
        sentiment: r.sentiment,
        fetchedAt: r.fetchedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching workspace stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
