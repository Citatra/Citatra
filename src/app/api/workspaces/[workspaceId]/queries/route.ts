import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Query from "@/models/Query";
import Membership from "@/models/Membership";
import TrackingResult from "@/models/TrackingResult";
import Competitor from "@/models/Competitor";
import { triggerEvent } from "@/lib/pusher-server";
import { triggerBackgroundFetch } from "@/lib/query-fetcher";
import mongoose from "mongoose";

export const runtime = "nodejs";

// GET /api/workspaces/[workspaceId]/queries — List queries with aggregated metrics
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

    // Verify membership
    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const wsOid = new mongoose.Types.ObjectId(workspaceId);

    const [queries, competitors] = await Promise.all([
      Query.find({ tenantId: workspaceId }).sort({ createdAt: -1 }).lean(),
      Competitor.find({ tenantId: workspaceId }).select("name domain").lean(),
    ]);

    if (queries.length === 0) {
      return NextResponse.json({ queries: [] });
    }

    const queryIds = queries.map((q) => q._id);
    const competitorMap = new Map(competitors.map((c) => [c.domain, c.name]));

    // Two-stage aggregation: first find latest fetchedAt per query,
    // then aggregate only results from that latest batch.
    const metricsAgg = await TrackingResult.aggregate([
      // Stage 1: Match all results for these queries
      {
        $match: {
          queryId: { $in: queryIds },
          tenantId: wsOid,
        },
      },
      // Stage 2: Sort by fetchedAt descending
      { $sort: { fetchedAt: -1 } },
      // Stage 3: Group by queryId to find the latest fetchedAt
      {
        $group: {
          _id: "$queryId",
          latestFetchedAt: { $first: "$fetchedAt" },
          // Push all results to filter by latest batch in next stage
          results: { $push: "$$ROOT" },
        },
      },
      // Stage 4: Filter each group's results to only the latest batch
      {
        $project: {
          latestFetchedAt: 1,
          results: {
            $filter: {
              input: "$results",
              as: "r",
              cond: { $eq: ["$$r.fetchedAt", "$latestFetchedAt"] },
            },
          },
        },
      },
      // Stage 5: Unwind to get individual results again
      { $unwind: "$results" },
      // Stage 6: Re-group by queryId with only latest batch results
      {
        $group: {
          _id: "$_id",
          latestFetchedAt: { $first: "$latestFetchedAt" },
          totalResults: { $sum: 1 },
          brandMentions: {
            $sum: { $cond: ["$results.isBrandMentioned", 1, 0] },
          },
          uniqueEngines: { $addToSet: "$results.engine" },
          brandEngines: {
            $addToSet: {
              $cond: ["$results.isBrandMentioned", "$results.engine", "$$REMOVE"],
            },
          },
          sentiments: { $push: "$results.sentiment" },
          brandSentiments: {
            $push: {
              $cond: [
                "$results.isBrandMentioned",
                "$results.sentiment",
                "$$REMOVE",
              ],
            },
          },
          positions: {
            $push: {
              pos: "$results.sourcePosition",
              brand: "$results.isBrandMentioned",
            },
          },
          competitorDomains: { $push: "$results.competitorDomain" },
        },
      },
    ]);

    // Build lookup map: queryId string → metrics
    const metricsMap = new Map<
      string,
      {
        visibility: number | null;
        sentiment: string | null;
        avgPosition: number | null;
        competitors: { domain: string; name: string }[];
      }
    >();

    for (const m of metricsAgg) {
      const qid = m._id.toString();

      // Visibility: % of engines where brand was mentioned (per-engine, not per-result)
      const engineCount = (m.uniqueEngines || []).length;
      const brandEngineCount = (m.brandEngines || []).filter(Boolean).length;
      const visibility =
        engineCount > 0
          ? Math.round((brandEngineCount / engineCount) * 100)
          : null;

      // Sentiment: dominant sentiment from brand-mentioned results, fallback to all
      const sentimentSource =
        (m.brandSentiments || []).filter(Boolean).length > 0
          ? m.brandSentiments.filter(Boolean)
          : (m.sentiments || []).filter(Boolean);
      const sentimentCounts: Record<string, number> = {};
      for (const s of sentimentSource) {
        if (s) sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
      }
      const dominantSentiment =
        Object.keys(sentimentCounts).length > 0
          ? Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0][0]
          : null;

      // Average brand position
      const brandPositions = (m.positions || [])
        .filter(
          (p: { pos: number; brand: boolean }) => p.brand && p.pos > 0
        )
        .map((p: { pos: number }) => p.pos);
      const avgPos =
        brandPositions.length > 0
          ? Math.round(
              (brandPositions.reduce((a: number, b: number) => a + b, 0) /
                brandPositions.length) *
                10
            ) / 10
          : null;

      // Unique competitor domains
      const uniqueDomains = [
        ...new Set(
          (m.competitorDomains || []).filter(
            (d: string | null) => d && d !== ""
          )
        ),
      ] as string[];
      const comps = uniqueDomains.map((d) => ({
        domain: d,
        name:
          competitorMap.get(d) || d.replace(/^www\./, "").split(".")[0],
      }));

      metricsMap.set(qid, {
        visibility,
        sentiment: dominantSentiment as
          | "positive"
          | "neutral"
          | "negative"
          | null,
        avgPosition: avgPos,
        competitors: comps,
      });
    }

    return NextResponse.json({
      queries: queries.map((q) => {
        const qid = q._id.toString();
        const metrics = metricsMap.get(qid);
        return {
          id: qid,
          queryText: q.queryText,
          status: q.status,
          engines: q.engines || ["google_ai_overview"],
          topic: q.topic || "",
          tags: q.tags || [],
          location: q.location || "us",
          promptVolume: q.promptVolume ?? null,
          suggestedAt: q.suggestedAt || null,
          lastFetchedAt: q.lastFetchedAt || null,
          createdAt: q.createdAt,
          // Aggregated metrics from latest TrackingResult batch
          visibility: metrics?.visibility ?? null,
          sentiment: metrics?.sentiment ?? null,
          avgPosition: metrics?.avgPosition ?? null,
          competitors: metrics?.competitors ?? [],
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching queries:", error);
    return NextResponse.json(
      { error: "Failed to fetch queries" },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/[workspaceId]/queries — Create a new tracked query
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

    // Verify membership with edit permissions
    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (membership.role === "viewer") {
      return NextResponse.json(
        { error: "Viewers cannot create queries" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { queryText, engines, topic, tags, location } = body;

    if (!queryText || typeof queryText !== "string" || !queryText.trim()) {
      return NextResponse.json(
        { error: "queryText is required" },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await Query.findOne({
      tenantId: workspaceId,
      queryText: queryText.trim(),
      status: { $ne: "archived" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "This query is already being tracked" },
        { status: 409 }
      );
    }

    const validEngines = ["google_ai_overview", "bing_chat", "perplexity", "chatgpt"];
    const selectedEngines = Array.isArray(engines)
      ? engines.filter((e: string) => validEngines.includes(e))
      : ["google_ai_overview"];

    const query = await Query.create({
      tenantId: workspaceId,
      queryText: queryText.trim(),
      status: "active",
      engines: selectedEngines.length > 0 ? selectedEngines : ["google_ai_overview"],
      topic: typeof topic === "string" ? topic.trim() : "",
      tags: Array.isArray(tags) ? tags.map((t: string) => t.trim()).filter(Boolean) : [],
      location: typeof location === "string" && location.trim() ? location.trim().toLowerCase() : "us",
      promptVolume: 3,
      createdBy: session.user.id,
    });

    // Fire-and-forget: trigger initial AI Overview fetch
    triggerBackgroundFetch(workspaceId, query._id.toString());

    // Pusher: notify about new query
    await triggerEvent(workspaceId, "query:created", {
      id: query._id.toString(),
      queryText: query.queryText,
      status: query.status,
    });

    return NextResponse.json(
      {
        query: {
          id: query._id.toString(),
          queryText: query.queryText,
          status: query.status,
          lastFetchedAt: query.lastFetchedAt,
          createdBy: query.createdBy.toString(),
          createdAt: query.createdAt,
          updatedAt: query.updatedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating query:", error);
    return NextResponse.json(
      { error: "Failed to create query" },
      { status: 500 }
    );
  }
}
