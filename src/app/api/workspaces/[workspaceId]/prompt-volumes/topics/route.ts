import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import PromptVolume from "@/models/PromptVolume";
import Membership from "@/models/Membership";
import mongoose from "mongoose";

export const runtime = "nodejs";

// GET /api/workspaces/[workspaceId]/prompt-volumes/topics
// Query params: q, engine, region, intent, sentiment, from, to, trending, provenance, sort, limit, offset
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
    const q = url.searchParams.get("q") || "";
    const engine = url.searchParams.get("engine") || "";
    const region = url.searchParams.get("region") || "";
    const intent = url.searchParams.get("intent") || "";
    const sentiment = url.searchParams.get("sentiment") || "";
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const trending = url.searchParams.get("trending") || "";
    const provenance = url.searchParams.get("provenance") || "";
    const sort = url.searchParams.get("sort") || "estimatedVolume";
    const order = url.searchParams.get("order") === "asc" ? 1 : -1;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    // Build filter
    const filter: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(workspaceId),
    };

    if (q) {
      filter.$or = [
        { canonicalTopic: { $regex: q, $options: "i" } },
        { exemplarPrompts: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } },
      ];
    }

    if (engine) {
      filter["engineBreakdown.engine"] = engine;
    }

    if (region) {
      filter["regionBreakdown.region"] = region;
    }

    if (intent) {
      filter.intent = intent;
    }

    if (sentiment) {
      filter.sentiment = sentiment;
    }

    if (provenance) {
      filter.provenance = provenance;
    }

    if (trending === "true") {
      filter.isTrending = true;
    }

    if (from || to) {
      filter.periodStart = {};
      if (from) (filter.periodStart as Record<string, Date>).$gte = new Date(from);
      if (to) (filter.periodStart as Record<string, Date>).$lte = new Date(to);
    }

    const sortObj: Record<string, 1 | -1> = { [sort]: order };

    const [topics, total] = await Promise.all([
      PromptVolume.find(filter)
        .sort(sortObj)
        .skip(offset)
        .limit(limit)
        .lean(),
      PromptVolume.countDocuments(filter),
    ]);

    // Compute summary stats
    const statsAgg = await PromptVolume.aggregate([
      { $match: { tenantId: new mongoose.Types.ObjectId(workspaceId) } },
      {
        $group: {
          _id: null,
          totalTopics: { $sum: 1 },
          totalVolume: { $sum: "$estimatedVolume" },
          avgVolume: { $avg: "$estimatedVolume" },
          trendingCount: {
            $sum: { $cond: ["$isTrending", 1, 0] },
          },
          risingCount: {
            $sum: {
              $cond: [{ $eq: ["$trendDirection", "rising"] }, 1, 0],
            },
          },
          avgWeekOverWeek: { $avg: "$weekOverWeekChange" },
        },
      },
    ]);

    const stats = statsAgg[0] || {
      totalTopics: 0,
      totalVolume: 0,
      avgVolume: 0,
      trendingCount: 0,
      risingCount: 0,
      avgWeekOverWeek: 0,
    };

    return NextResponse.json({
      topics: topics.map((t) => ({
        id: t._id.toString(),
        canonicalTopic: t.canonicalTopic,
        exemplarPrompts: t.exemplarPrompts,
        estimatedVolume: t.estimatedVolume,
        volumeCILow: t.volumeCILow,
        volumeCIHigh: t.volumeCIHigh,
        confidence: t.confidence,
        engineBreakdown: t.engineBreakdown,
        regionBreakdown: t.regionBreakdown,
        intent: t.intent,
        sentiment: t.sentiment,
        provenance: t.provenance,
        observedFraction: t.observedFraction,
        syntheticFraction: t.syntheticFraction,
        tags: t.tags,
        language: t.language,
        trendData: t.trendData,
        weekOverWeekChange: t.weekOverWeekChange,
        isTrending: t.isTrending,
        trendDirection: t.trendDirection,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
        granularity: t.granularity,
        relatedTopicIds: t.relatedTopicIds?.map((id: mongoose.Types.ObjectId) => id.toString()),
        createdAt: t.createdAt,
      })),
      total,
      stats,
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching prompt volume topics:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt volume topics" },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/[workspaceId]/prompt-volumes/topics
// Manually create a prompt volume topic entry (or seed data)
export async function POST(
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
    if (!membership || membership.role === "viewer") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();

    // Support batch creation
    const items = Array.isArray(body) ? body : [body];

    const created = await PromptVolume.insertMany(
      items.map((item) => ({
        tenantId: workspaceId,
        canonicalTopic: item.canonicalTopic,
        exemplarPrompts: item.exemplarPrompts || [],
        estimatedVolume: item.estimatedVolume || 0,
        volumeCILow: item.volumeCILow || 0,
        volumeCIHigh: item.volumeCIHigh || 0,
        confidence: item.confidence || "medium",
        engineBreakdown: item.engineBreakdown || [],
        regionBreakdown: item.regionBreakdown || [],
        intent: item.intent || "informational",
        sentiment: item.sentiment || "neutral",
        provenance: item.provenance || "observed",
        observedFraction: item.observedFraction ?? 1,
        syntheticFraction: item.syntheticFraction ?? 0,
        tags: item.tags || [],
        language: item.language || "en",
        trendData: item.trendData || [],
        weekOverWeekChange: item.weekOverWeekChange || 0,
        isTrending: item.isTrending || false,
        trendDirection: item.trendDirection || "stable",
        periodStart: item.periodStart || new Date(),
        periodEnd: item.periodEnd || new Date(),
        granularity: item.granularity || "weekly",
        createdBy: session.user.id,
      }))
    );

    return NextResponse.json(
      {
        created: created.length,
        ids: created.map((c) => c._id.toString()),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating prompt volume topics:", error);
    return NextResponse.json(
      { error: "Failed to create prompt volume topics" },
      { status: 500 }
    );
  }
}
