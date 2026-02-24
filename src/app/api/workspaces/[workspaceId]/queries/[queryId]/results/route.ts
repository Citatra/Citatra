import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import TrackingResult from "@/models/TrackingResult";
import Membership from "@/models/Membership";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ workspaceId: string; queryId: string }>;
};

/**
 * GET /api/workspaces/[workspaceId]/queries/[queryId]/results
 *
 * List all tracking results for a query, with optional pagination.
 */
export async function GET(req: Request, { params }: Params) {
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

    // Parse pagination from query string
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("limit") || "50"))
    );
    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      TrackingResult.find({ queryId, tenantId: workspaceId })
        .sort({ fetchedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TrackingResult.countDocuments({ queryId, tenantId: workspaceId }),
    ]);

    return NextResponse.json({
      results: results.map((r) => ({
        id: r._id.toString(),
        contentSnippet: r.contentSnippet,
        sourceUrl: r.sourceUrl,
        engine: r.engine,
        isBrandMentioned: r.isBrandMentioned,
        brandTextVisibility: r.brandTextVisibility ?? 0,
        mentionType: r.mentionType,
        sentiment: r.sentiment,
        sourcePosition: r.sourcePosition ?? 0,
        competitorDomain: r.competitorDomain ?? null,
        overviewText: r.overviewText ?? "",
        metadata: r.metadata,
        fetchedAt: r.fetchedAt,
        createdAt: r.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching results:", error);
    return NextResponse.json(
      { error: "Failed to fetch results" },
      { status: 500 }
    );
  }
}
