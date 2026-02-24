import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";
import Membership from "@/models/Membership";
import { triggerEvent } from "@/lib/pusher-server";
import { triggerBackgroundFetch } from "@/lib/query-fetcher";

export const runtime = "nodejs";

type Params = { params: Promise<{ workspaceId: string; queryId: string }> };

// GET /api/workspaces/[workspaceId]/queries/[queryId] — Get a single query with latest result
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

    // Get latest result
    const latestResult = await TrackingResult.findOne({ queryId })
      .sort({ fetchedAt: -1 })
      .lean();

    // Get total results count
    const resultsCount = await TrackingResult.countDocuments({ queryId });

    return NextResponse.json({
      query: {
        id: query._id.toString(),
        queryText: query.queryText,
        status: query.status,
        lastFetchedAt: query.lastFetchedAt,
        createdBy: query.createdBy.toString(),
        createdAt: query.createdAt,
        updatedAt: query.updatedAt,
      },
      latestResult: latestResult
        ? {
            id: latestResult._id.toString(),
            contentSnippet: latestResult.contentSnippet,
            sourceUrl: latestResult.sourceUrl,
            engine: latestResult.engine,
            isBrandMentioned: latestResult.isBrandMentioned,
            brandTextVisibility: latestResult.brandTextVisibility ?? 0,
            mentionType: latestResult.mentionType,
            sentiment: latestResult.sentiment,
            sourcePosition: latestResult.sourcePosition ?? 0,
            competitorDomain: latestResult.competitorDomain ?? null,
            overviewText: latestResult.overviewText ?? "",
            metadata: latestResult.metadata,
            fetchedAt: latestResult.fetchedAt,
          }
        : null,
      resultsCount,
    });
  } catch (error) {
    console.error("Error fetching query:", error);
    return NextResponse.json(
      { error: "Failed to fetch query" },
      { status: 500 }
    );
  }
}

// PATCH /api/workspaces/[workspaceId]/queries/[queryId] — Update a query (status, text)
export async function PATCH(req: Request, { params }: Params) {
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
    if (!membership || membership.role === "viewer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.status && ["active", "inactive", "suggested", "paused", "archived"].includes(body.status)) {
      updates.status = body.status;
    }
    if (body.queryText && typeof body.queryText === "string") {
      updates.queryText = body.queryText.trim();
    }
    if (typeof body.topic === "string") {
      updates.topic = body.topic.trim();
    }
    if (Array.isArray(body.tags)) {
      updates.tags = body.tags.map((t: string) => t.trim()).filter(Boolean);
    }
    if (typeof body.location === "string" && body.location.trim()) {
      updates.location = body.location.trim().toLowerCase();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 }
      );
    }

    const query = await Query.findOneAndUpdate(
      { _id: queryId, tenantId: workspaceId },
      updates,
      { new: true }
    ).lean();

    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 });
    }

    // Pusher: notify about query update
    await triggerEvent(workspaceId, "query:updated", {
      id: query._id.toString(),
      queryText: query.queryText,
      status: query.status,
    });

    // Auto-fetch when a query is activated and has never been fetched
    if (updates.status === "active" && !query.lastFetchedAt) {
      triggerBackgroundFetch(workspaceId, queryId);
    }

    return NextResponse.json({
      query: {
        id: query._id.toString(),
        queryText: query.queryText,
        status: query.status,
        lastFetchedAt: query.lastFetchedAt,
        createdBy: query.createdBy.toString(),
        createdAt: query.createdAt,
        updatedAt: query.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating query:", error);
    return NextResponse.json(
      { error: "Failed to update query" },
      { status: 500 }
    );
  }
}

// DELETE /api/workspaces/[workspaceId]/queries/[queryId] — Delete a query and its results
export async function DELETE(_req: Request, { params }: Params) {
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
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const query = await Query.findOneAndDelete({
      _id: queryId,
      tenantId: workspaceId,
    });

    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 });
    }

    // Clean up associated results
    await TrackingResult.deleteMany({ queryId });

    // Pusher: notify about query deletion
    await triggerEvent(workspaceId, "query:deleted", { id: queryId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting query:", error);
    return NextResponse.json(
      { error: "Failed to delete query" },
      { status: 500 }
    );
  }
}
