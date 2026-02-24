import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";
import Membership from "@/models/Membership";

export const runtime = "nodejs";

type Params = { params: Promise<{ workspaceId: string; queryId: string }> };

/**
 * GET /api/workspaces/[workspaceId]/queries/[queryId]/overview
 *
 * Returns the latest AI Overview snapshot for a query — the full overview text
 * and all cited sources with their position, brand/competitor mentions, etc.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, queryId } = await params;
    await connectToDatabase();

    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const query = await Query.findOne({
      _id: queryId,
      tenantId: workspaceId,
    }).lean();

    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 });
    }

    // Get the latest fetch timestamp for this query
    const latestResult = await TrackingResult.findOne({ queryId })
      .sort({ fetchedAt: -1 })
      .select("fetchedAt")
      .lean();

    if (!latestResult) {
      return NextResponse.json({
        queryText: query.queryText,
        overviewText: null,
        sources: [],
        fetchedAt: null,
        engines: [],
      });
    }

    // Retrieve all results from the latest fetch batch
    const results = await TrackingResult.find({
      queryId,
      fetchedAt: latestResult.fetchedAt,
    })
      .sort({ engine: 1, sourcePosition: 1 })
      .lean();

    // Extract unique overview text & group sources per engine
    const engineMap = new Map<
      string,
      {
        overviewText: string;
        sources: {
          position: number;
          url: string;
          title: string;
          snippet: string;
          isBrandMentioned: boolean;
          mentionType: string;
          sentiment: string;
          competitorDomain: string;
        }[];
      }
    >();

    for (const r of results) {
      const engine = r.engine || "google_ai_overview";
      if (!engineMap.has(engine)) {
        engineMap.set(engine, {
          overviewText: r.overviewText || "",
          sources: [],
        });
      }

      const entry = engineMap.get(engine)!;

      // Only add sources with a real URL (skip fallback rows and "no-source" placeholders)
      if (r.sourceUrl && r.sourceUrl !== "no-source") {
        entry.sources.push({
          position: r.sourcePosition ?? 0,
          url: r.sourceUrl,
          title:
            (r.metadata as Record<string, unknown>)?.sourceTitle
              ? String((r.metadata as Record<string, unknown>).sourceTitle)
              : "",
          snippet: r.contentSnippet || "",
          isBrandMentioned: r.isBrandMentioned,
          mentionType: r.mentionType || "none",
          sentiment: r.sentiment || "neutral",
          competitorDomain: r.competitorDomain || "",
        });
      }
    }

    const engines = Array.from(engineMap.entries()).map(([engine, data]) => ({
      engine,
      overviewText: data.overviewText,
      sources: data.sources,
    }));

    // Use the first engine's overview as the "primary" overview text
    const primaryOverview = engines[0]?.overviewText || "";

    return NextResponse.json({
      queryText: query.queryText,
      overviewText: primaryOverview,
      engines,
      fetchedAt: latestResult.fetchedAt,
    });
  } catch (error) {
    console.error("Error fetching AI Overview:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI Overview data" },
      { status: 500 }
    );
  }
}
