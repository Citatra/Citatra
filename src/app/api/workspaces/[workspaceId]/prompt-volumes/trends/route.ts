import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import PromptVolume from "@/models/PromptVolume";
import Membership from "@/models/Membership";
import mongoose from "mongoose";

export const runtime = "nodejs";

// GET /api/workspaces/[workspaceId]/prompt-volumes/trends
// Query params: topicId, granularity (daily|weekly|monthly), from, to, engine, region
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
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const url = new URL(req.url);
    const topicId = url.searchParams.get("topicId") || "";
    const granularity = url.searchParams.get("granularity") || "weekly";
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const engine = url.searchParams.get("engine") || "";
    const region = url.searchParams.get("region") || "";

    if (!topicId) {
      // Aggregate trends across all topics
      const matchStage: Record<string, unknown> = {
        tenantId: new mongoose.Types.ObjectId(workspaceId),
      };

      if (from || to) {
        matchStage.periodStart = {};
        if (from) (matchStage.periodStart as Record<string, Date>).$gte = new Date(from);
        if (to) (matchStage.periodStart as Record<string, Date>).$lte = new Date(to);
      }

      // Get top trending topics with their trend data
      const trendingTopics = await PromptVolume.find(matchStage)
        .sort({ weekOverWeekChange: -1 })
        .limit(20)
        .select(
          "canonicalTopic estimatedVolume weekOverWeekChange trendDirection isTrending trendData engineBreakdown"
        )
        .lean();

      // Aggregate overall volume over time
      const overallTrend = await PromptVolume.aggregate([
        { $match: matchStage },
        { $unwind: "$trendData" },
        {
          $group: {
            _id: {
              $dateToString: {
                format: granularity === "daily" ? "%Y-%m-%d" : granularity === "monthly" ? "%Y-%m" : "%Y-W%V",
                date: "$trendData.date",
              },
            },
            totalVolume: { $sum: "$trendData.volume" },
            avgDelta: { $avg: "$trendData.delta" },
            topicCount: { $addToSet: "$_id" },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            period: "$_id",
            totalVolume: 1,
            avgDelta: 1,
            topicCount: { $size: "$topicCount" },
          },
        },
      ]);

      // Engine distribution
      const engineDistribution = await PromptVolume.aggregate([
        { $match: matchStage },
        { $unwind: "$engineBreakdown" },
        {
          $group: {
            _id: "$engineBreakdown.engine",
            totalVolume: { $sum: "$engineBreakdown.volume" },
            avgShare: { $avg: "$engineBreakdown.share" },
          },
        },
        { $sort: { totalVolume: -1 } },
      ]);

      // Region distribution
      const regionDistribution = await PromptVolume.aggregate([
        { $match: matchStage },
        { $unwind: "$regionBreakdown" },
        {
          $group: {
            _id: "$regionBreakdown.region",
            totalVolume: { $sum: "$regionBreakdown.volume" },
            avgShare: { $avg: "$regionBreakdown.share" },
          },
        },
        { $sort: { totalVolume: -1 } },
        { $limit: 20 },
      ]);

      // Intent distribution
      const intentDistribution = await PromptVolume.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$intent",
            count: { $sum: 1 },
            totalVolume: { $sum: "$estimatedVolume" },
          },
        },
        { $sort: { totalVolume: -1 } },
      ]);

      // Sentiment distribution
      const sentimentDistribution = await PromptVolume.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: "$sentiment",
            count: { $sum: 1 },
            totalVolume: { $sum: "$estimatedVolume" },
          },
        },
        { $sort: { totalVolume: -1 } },
      ]);

      return NextResponse.json({
        trendingTopics: trendingTopics.map((t) => ({
          id: t._id.toString(),
          canonicalTopic: t.canonicalTopic,
          estimatedVolume: t.estimatedVolume,
          weekOverWeekChange: t.weekOverWeekChange,
          trendDirection: t.trendDirection,
          isTrending: t.isTrending,
          trendData: t.trendData,
          engineBreakdown: t.engineBreakdown,
        })),
        overallTrend,
        engineDistribution: engineDistribution.map((e) => ({
          engine: e._id,
          totalVolume: e.totalVolume,
          avgShare: Math.round(e.avgShare * 100) / 100,
        })),
        regionDistribution: regionDistribution.map((r) => ({
          region: r._id,
          totalVolume: r.totalVolume,
          avgShare: Math.round(r.avgShare * 100) / 100,
        })),
        intentDistribution: intentDistribution.map((i) => ({
          intent: i._id,
          count: i.count,
          totalVolume: i.totalVolume,
        })),
        sentimentDistribution: sentimentDistribution.map((s) => ({
          sentiment: s._id,
          count: s.count,
          totalVolume: s.totalVolume,
        })),
      });
    }

    // Single topic trend
    const topic = await PromptVolume.findOne({
      _id: new mongoose.Types.ObjectId(topicId),
      tenantId: new mongoose.Types.ObjectId(workspaceId),
    }).lean();

    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    // Get related topics
    const relatedTopics = topic.relatedTopicIds?.length
      ? await PromptVolume.find({
          _id: { $in: topic.relatedTopicIds },
          tenantId: new mongoose.Types.ObjectId(workspaceId),
        })
          .select("canonicalTopic estimatedVolume weekOverWeekChange trendDirection")
          .lean()
      : [];

    // Filter trend data by date range if provided
    let trendData = topic.trendData || [];
    if (from) {
      const fromDate = new Date(from);
      trendData = trendData.filter((t: { date: Date }) => new Date(t.date) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      trendData = trendData.filter((t: { date: Date }) => new Date(t.date) <= toDate);
    }

    // Filter engine breakdown
    let engineBreakdown = topic.engineBreakdown || [];
    if (engine) {
      engineBreakdown = engineBreakdown.filter(
        (e: { engine: string }) => e.engine === engine
      );
    }

    // Filter region breakdown
    let regionBreakdown = topic.regionBreakdown || [];
    if (region) {
      regionBreakdown = regionBreakdown.filter(
        (r: { region: string }) => r.region === region
      );
    }

    return NextResponse.json({
      topic: {
        id: topic._id.toString(),
        canonicalTopic: topic.canonicalTopic,
        exemplarPrompts: topic.exemplarPrompts,
        estimatedVolume: topic.estimatedVolume,
        volumeCILow: topic.volumeCILow,
        volumeCIHigh: topic.volumeCIHigh,
        confidence: topic.confidence,
        engineBreakdown,
        regionBreakdown,
        intent: topic.intent,
        sentiment: topic.sentiment,
        provenance: topic.provenance,
        observedFraction: topic.observedFraction,
        syntheticFraction: topic.syntheticFraction,
        tags: topic.tags,
        weekOverWeekChange: topic.weekOverWeekChange,
        isTrending: topic.isTrending,
        trendDirection: topic.trendDirection,
        trendData,
        periodStart: topic.periodStart,
        periodEnd: topic.periodEnd,
      },
      relatedTopics: relatedTopics.map((r) => ({
        id: r._id.toString(),
        canonicalTopic: r.canonicalTopic,
        estimatedVolume: r.estimatedVolume,
        weekOverWeekChange: r.weekOverWeekChange,
        trendDirection: r.trendDirection,
      })),
    });
  } catch (error) {
    console.error("Error fetching prompt volume trends:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt volume trends" },
      { status: 500 }
    );
  }
}
