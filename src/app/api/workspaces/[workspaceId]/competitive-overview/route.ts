import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import TrackingResult from "@/models/TrackingResult";
import Competitor from "@/models/Competitor";
import Workspace from "@/models/Workspace";
import Membership from "@/models/Membership";
import mongoose from "mongoose";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/competitive-overview
 *
 * Returns daily time-series and period averages for visibility, sentiment,
 * and position for the brand and every competitor.
 *
 * Query params:
 *   - days  (default 30, max 365)
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

    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - days);
    const prevSince = new Date(since);
    prevSince.setDate(prevSince.getDate() - days);

    const wsObjId = new mongoose.Types.ObjectId(workspaceId);

    const [workspace, competitors] = await Promise.all([
      Workspace.findById(workspaceId).lean(),
      Competitor.find({ tenantId: workspaceId }).lean(),
    ]);

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const brandDomain = (workspace as unknown as Record<string, unknown>).domain as string || "";
    const competitorDomains = competitors.map((c) => c.domain as string);

    // ---- Helper: aggregate a period ----
    async function aggregatePeriod(from: Date, to: Date) {
      // Daily totals
      const dailyTotals = await TrackingResult.aggregate([
        { $match: { tenantId: wsObjId, fetchedAt: { $gte: from, $lt: to } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$fetchedAt" } },
            total: { $sum: 1 },
            brandMentions: { $sum: { $cond: ["$isBrandMentioned", 1, 0] } },
            // Average brand text visibility score (0-100) based on brand name position in AI text
            brandTextVisibilitySum: {
              $sum: { $ifNull: ["$brandTextVisibility", 0] },
            },
            brandTextVisibilityCount: {
              $sum: { $cond: [{ $gt: [{ $ifNull: ["$brandTextVisibility", 0] }, 0] }, 1, 0] },
            },
            // Sentiment counts for brand (where brand name appears in text)
            brandPositive: {
              $sum: { $cond: [{ $and: [{ $gt: [{ $ifNull: ["$brandTextVisibility", 0] }, 0] }, { $eq: ["$sentiment", "positive"] }] }, 1, 0] },
            },
            brandNeutral: {
              $sum: { $cond: [{ $and: [{ $gt: [{ $ifNull: ["$brandTextVisibility", 0] }, 0] }, { $eq: ["$sentiment", "neutral"] }] }, 1, 0] },
            },
            brandNegative: {
              $sum: { $cond: [{ $and: [{ $gt: [{ $ifNull: ["$brandTextVisibility", 0] }, 0] }, { $eq: ["$sentiment", "negative"] }] }, 1, 0] },
            },
            // Avg position for brand (where domain is cited as a source)
            brandPositionSum: {
              $sum: {
                $cond: [
                  { $and: ["$isBrandMentioned", { $gt: ["$sourcePosition", 0] }] },
                  "$sourcePosition",
                  0,
                ],
              },
            },
            brandPositionCount: {
              $sum: {
                $cond: [
                  { $and: ["$isBrandMentioned", { $gt: ["$sourcePosition", 0] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Daily competitor stats
      const dailyCompetitors = await TrackingResult.aggregate([
        {
          $match: {
            tenantId: wsObjId,
            fetchedAt: { $gte: from, $lt: to },
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
            positive: { $sum: { $cond: [{ $eq: ["$sentiment", "positive"] }, 1, 0] } },
            neutral: { $sum: { $cond: [{ $eq: ["$sentiment", "neutral"] }, 1, 0] } },
            negative: { $sum: { $cond: [{ $eq: ["$sentiment", "negative"] }, 1, 0] } },
            positionSum: {
              $sum: { $cond: [{ $gt: ["$sourcePosition", 0] }, "$sourcePosition", 0] },
            },
            positionCount: {
              $sum: { $cond: [{ $gt: ["$sourcePosition", 0] }, 1, 0] },
            },
          },
        },
        { $sort: { "_id.date": 1 } },
      ]);

      return { dailyTotals, dailyCompetitors };
    }

    // ---- Current period ----
    const current = await aggregatePeriod(since, now);

    // ---- Previous period (for % change) ----
    const previous = await aggregatePeriod(prevSince, since);

    // ---- Build entities ----
    const entities = [
      { key: brandDomain || "your_brand", name: "Your Brand", domain: brandDomain, color: "#3b82f6", isBrand: true },
      ...competitors.map((c) => ({
        key: c.domain as string,
        name: c.name as string,
        domain: c.domain as string,
        color: (c.color as string) || "#888888",
        isBrand: false,
      })),
    ];

    // ---- Build daily time series ----
    // Collect all dates
    const allDates = new Set<string>();
    for (const d of current.dailyTotals) allDates.add(d._id);
    const sortedDates = [...allDates].sort();

    // Index competitor data by date+domain
    const compDayMap = new Map<string, { mentions: number; positive: number; neutral: number; negative: number; positionSum: number; positionCount: number }>();
    for (const dc of current.dailyCompetitors) {
      compDayMap.set(`${dc._id.date}|${dc._id.domain}`, {
        mentions: dc.mentions,
        positive: dc.positive,
        neutral: dc.neutral,
        negative: dc.negative,
        positionSum: dc.positionSum,
        positionCount: dc.positionCount,
      });
    }

    function sentimentScore(pos: number, neu: number, neg: number): number {
      const total = pos + neu + neg;
      if (total === 0) return 0;
      // Scale: -100 (all negative) to +100 (all positive), 0 = all neutral
      return Math.round(((pos - neg) / total) * 100);
    }

    const timeSeries = sortedDates.map((date) => {
      const day = current.dailyTotals.find((d) => d._id === date);
      const total = day?.total || 0;

      const point: Record<string, unknown> = { date };

      for (const ent of entities) {
        if (ent.isBrand) {
          // Brand visibility = average brandTextVisibility across all results for the day
          const visSum = day?.brandTextVisibilitySum || 0;
          const visCount = day?.brandTextVisibilityCount || 0;
          point[`${ent.key}_visibility`] = visCount > 0 ? Math.round(visSum / total) : 0;
          point[`${ent.key}_sentiment`] = sentimentScore(
            day?.brandPositive || 0,
            day?.brandNeutral || 0,
            day?.brandNegative || 0
          );
          const posCount = day?.brandPositionCount || 0;
          point[`${ent.key}_position`] = posCount > 0
            ? parseFloat(((day?.brandPositionSum || 0) / posCount).toFixed(1))
            : null;
        } else {
          const cd = compDayMap.get(`${date}|${ent.domain}`);
          const mentions = cd?.mentions || 0;
          point[`${ent.key}_visibility`] = total > 0 ? Math.round((mentions / total) * 100) : 0;
          point[`${ent.key}_sentiment`] = cd
            ? sentimentScore(cd.positive, cd.neutral, cd.negative)
            : 0;
          const posCount = cd?.positionCount || 0;
          point[`${ent.key}_position`] = posCount > 0
            ? parseFloat(((cd?.positionSum || 0) / posCount).toFixed(1))
            : null;
        }
      }

      return point;
    });

    // ---- Compute period averages ----
    function computeAverages(
      dailyTotals: typeof current.dailyTotals,
      dailyCompetitors: typeof current.dailyCompetitors
    ) {
      const brandTotalMentions = dailyTotals.reduce((s, d) => s + (d.brandMentions || 0), 0);
      const overallTotal = dailyTotals.reduce((s, d) => s + (d.total || 0), 0);
      const brandVisSum = dailyTotals.reduce((s, d) => s + (d.brandTextVisibilitySum || 0), 0);
      const brandPos = dailyTotals.reduce((s, d) => s + (d.brandPositive || 0), 0);
      const brandNeu = dailyTotals.reduce((s, d) => s + (d.brandNeutral || 0), 0);
      const brandNeg = dailyTotals.reduce((s, d) => s + (d.brandNegative || 0), 0);
      const brandPosSum = dailyTotals.reduce((s, d) => s + (d.brandPositionSum || 0), 0);
      const brandPosCount = dailyTotals.reduce((s, d) => s + (d.brandPositionCount || 0), 0);

      const byDomain = new Map<string, { mentions: number; pos: number; neu: number; neg: number; posSum: number; posCount: number }>();
      for (const dc of dailyCompetitors) {
        const domain = dc._id.domain;
        const existing = byDomain.get(domain) || { mentions: 0, pos: 0, neu: 0, neg: 0, posSum: 0, posCount: 0 };
        existing.mentions += dc.mentions;
        existing.pos += dc.positive;
        existing.neu += dc.neutral;
        existing.neg += dc.negative;
        existing.posSum += dc.positionSum;
        existing.posCount += dc.positionCount;
        byDomain.set(domain, existing);
      }

      return {
        overallTotal,
        brand: {
          visibility: overallTotal > 0 ? Math.round(brandVisSum / overallTotal) : 0,
          sentiment: sentimentScore(brandPos, brandNeu, brandNeg),
          position: brandPosCount > 0 ? parseFloat((brandPosSum / brandPosCount).toFixed(1)) : null,
        },
        competitors: Object.fromEntries(
          [...byDomain.entries()].map(([domain, data]) => [
            domain,
            {
              visibility: overallTotal > 0 ? Math.round((data.mentions / overallTotal) * 100) : 0,
              sentiment: sentimentScore(data.pos, data.neu, data.neg),
              position: data.posCount > 0 ? parseFloat((data.posSum / data.posCount).toFixed(1)) : null,
            },
          ])
        ),
      };
    }

    const currentAvg = computeAverages(current.dailyTotals, current.dailyCompetitors);
    const previousAvg = computeAverages(previous.dailyTotals, previous.dailyCompetitors);

    // ---- Build table data with % change ----
    function pctChange(current: number | null, previous: number | null): number | null {
      if (current === null || previous === null) return null;
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / Math.abs(previous)) * 100);
    }

    const tableData = entities.map((ent) => {
      const cur = ent.isBrand
        ? currentAvg.brand
        : (currentAvg.competitors[ent.domain] || { visibility: 0, sentiment: 0, position: null });
      const prev = ent.isBrand
        ? previousAvg.brand
        : (previousAvg.competitors[ent.domain] || { visibility: 0, sentiment: 0, position: null });

      return {
        key: ent.key,
        name: ent.name,
        domain: ent.domain,
        color: ent.color,
        isBrand: ent.isBrand,
        visibility: cur.visibility,
        visibilityChange: pctChange(cur.visibility, prev.visibility),
        sentiment: cur.sentiment,
        sentimentChange: pctChange(cur.sentiment, prev.sentiment),
        position: cur.position,
        positionChange: pctChange(cur.position, prev.position),
      };
    });

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      entities: entities.map(({ key, name, domain, color, isBrand }) => ({
        key,
        name,
        domain,
        color,
        isBrand,
      })),
      timeSeries,
      tableData,
    });
  } catch (error) {
    console.error("Competitive overview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch competitive overview" },
      { status: 500 }
    );
  }
}
