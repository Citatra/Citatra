import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import TrackingResult from "@/models/TrackingResult";
import Query from "@/models/Query";
import Competitor from "@/models/Competitor";
import Workspace from "@/models/Workspace";
import Membership from "@/models/Membership";
import mongoose from "mongoose";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/competitors/compare
 *
 * Returns comparison analytics: your brand vs. each competitor
 * across tracked queries.
 *
 * Query params:
 *   - days (default: 30)
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

    const wsObjId = new mongoose.Types.ObjectId(workspaceId);

    // Get workspace and competitors
    const [workspace, competitors] = await Promise.all([
      Workspace.findById(workspaceId).lean(),
      Competitor.find({ tenantId: workspaceId }).lean(),
    ]);

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const brandDomain = workspace.domain || "";
    const competitorDomains = competitors.map((c) => c.domain);
    const allDomains = [brandDomain, ...competitorDomains].filter(Boolean);

    // Total results per query in the period
    const totalsByQuery = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: { $eq: wsObjId },
          fetchedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: "$queryId",
          total: { $sum: 1 },
        },
      },
    ]);
    const totalMap = new Map(
      totalsByQuery.map((t) => [t._id.toString(), t.total as number])
    );

    // Brand mentions (isBrandMentioned = true)
    const brandMentions = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: { $eq: wsObjId },
          fetchedAt: { $gte: since },
          isBrandMentioned: true,
        },
      },
      {
        $group: {
          _id: "$queryId",
          mentions: { $sum: 1 },
        },
      },
    ]);
    const brandMentionMap = new Map(
      brandMentions.map((b) => [b._id.toString(), b.mentions as number])
    );

    // Competitor mentions (competitorDomain != "" and != brand)
    const competitorMentions = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: { $eq: wsObjId },
          fetchedAt: { $gte: since },
          competitorDomain: { $in: competitorDomains, $ne: "" },
        },
      },
      {
        $group: {
          _id: { queryId: "$queryId", domain: "$competitorDomain" },
          mentions: { $sum: 1 },
        },
      },
    ]);

    // Build a map: domain -> queryId -> mentions
    const compMentionMap = new Map<string, Map<string, number>>();
    for (const cm of competitorMentions) {
      const domain = cm._id.domain as string;
      const queryId = cm._id.queryId.toString();
      if (!compMentionMap.has(domain)) {
        compMentionMap.set(domain, new Map());
      }
      compMentionMap.get(domain)!.set(queryId, cm.mentions);
    }

    // Aggregate overall visibility rate per domain
    const overallTotalResults = [...totalMap.values()].reduce((a, b) => a + b, 0);

    const brandTotalMentions = [...brandMentionMap.values()].reduce((a, b) => a + b, 0);
    const brandVisibility = overallTotalResults > 0
      ? Math.round((brandTotalMentions / overallTotalResults) * 100)
      : 0;

    const competitorStats = competitors.map((comp) => {
      const domainMentionsByQuery = compMentionMap.get(comp.domain) || new Map();
      const totalMentions = [...domainMentionsByQuery.values()].reduce((a, b) => a + b, 0);
      const visibility = overallTotalResults > 0
        ? Math.round((totalMentions / overallTotalResults) * 100)
        : 0;

      return {
        id: comp._id.toString(),
        name: comp.name,
        domain: comp.domain,
        color: comp.color,
        totalMentions,
        visibility,
      };
    });

    // Time series: daily brand vs competitors
    const dailyBrand = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: { $eq: wsObjId },
          fetchedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$fetchedAt" } },
          total: { $sum: 1 },
          brandMentions: { $sum: { $cond: ["$isBrandMentioned", 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailyCompetitors = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: { $eq: wsObjId },
          fetchedAt: { $gte: since },
          competitorDomain: { $in: competitorDomains, $ne: "" },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$fetchedAt" } },
            domain: "$competitorDomain",
          },
          mentions: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]);

    // Build daily comparison map
    const dailyMap = new Map<string, Record<string, number>>();
    for (const d of dailyBrand) {
      dailyMap.set(d._id, {
        total: d.total,
        [brandDomain || "your_brand"]: d.brandMentions,
      });
    }
    for (const dc of dailyCompetitors) {
      const date = dc._id.date;
      const domain = dc._id.domain;
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { total: 0 });
      }
      dailyMap.get(date)![domain] = dc.mentions;
    }

    const dailyComparison = [...dailyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    // Per-query comparison
    const queries = await Query.find({ tenantId: workspaceId, status: "active" })
      .select("queryText")
      .lean();

    const queryComparison = queries.map((q) => {
      const qid = q._id.toString();
      const total = totalMap.get(qid) || 0;
      const brandCount = brandMentionMap.get(qid) || 0;

      const competitorCounts: Record<string, number> = {};
      for (const comp of competitors) {
        const domainMap = compMentionMap.get(comp.domain);
        competitorCounts[comp.domain] = domainMap?.get(qid) || 0;
      }

      return {
        queryId: qid,
        queryText: q.queryText,
        total,
        brandMentions: brandCount,
        brandVisibility: total > 0 ? Math.round((brandCount / total) * 100) : 0,
        competitors: competitors.map((comp) => ({
          domain: comp.domain,
          name: comp.name,
          color: comp.color,
          mentions: competitorCounts[comp.domain] || 0,
          visibility: total > 0
            ? Math.round(((competitorCounts[comp.domain] || 0) / total) * 100)
            : 0,
        })),
      };
    });

    // Engine distribution
    const engineDist = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: { $eq: wsObjId },
          fetchedAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: "$engine",
          total: { $sum: 1 },
          brandMentions: { $sum: { $cond: ["$isBrandMentioned", 1, 0] } },
        },
      },
    ]);

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      brand: {
        domain: brandDomain,
        totalMentions: brandTotalMentions,
        visibility: brandVisibility,
      },
      competitors: competitorStats,
      dailyComparison,
      queryComparison,
      engineDistribution: engineDist.map((e) => ({
        engine: e._id || "unknown",
        total: e.total,
        brandMentions: e.brandMentions,
      })),
      totalResults: overallTotalResults,
    });
  } catch (error) {
    console.error("Competitor comparison error:", error);
    return NextResponse.json(
      { error: "Failed to fetch comparison data" },
      { status: 500 }
    );
  }
}
