import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Competitor from "@/models/Competitor";
import Workspace from "@/models/Workspace";
import Membership from "@/models/Membership";
import TrackingResult from "@/models/TrackingResult";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ workspaceId: string; competitorId: string }>;
};

/**
 * GET /api/workspaces/[workspaceId]/competitors/[competitorId]
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, competitorId } = await params;
    await connectToDatabase();

    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const competitor = await Competitor.findOne({
      _id: competitorId,
      tenantId: workspaceId,
    }).lean();
    if (!competitor) {
      return NextResponse.json(
        { error: "Competitor not found" },
        { status: 404 }
      );
    }

    // Gather quick stats for this competitor
    const mentionCount = await TrackingResult.countDocuments({
      tenantId: workspaceId,
      competitorDomain: competitor.domain,
    });

    return NextResponse.json({
      competitor: {
        id: competitor._id.toString(),
        name: competitor.name,
        domain: competitor.domain,
        alternativeNames: competitor.alternativeNames ?? [],
        alternativeDomains: competitor.alternativeDomains ?? [],
        color: competitor.color,
        notes: competitor.notes,
        createdAt: competitor.createdAt,
        stats: { mentionCount },
      },
    });
  } catch (error) {
    console.error("Error fetching competitor:", error);
    return NextResponse.json(
      { error: "Failed to fetch competitor" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workspaces/[workspaceId]/competitors/[competitorId]
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, competitorId } = await params;
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

    if (body.name) updates.name = body.name.trim();
    if (body.color) updates.color = body.color;
    if (typeof body.notes === "string") updates.notes = body.notes;
    if (Array.isArray(body.alternativeNames)) {
      updates.alternativeNames = body.alternativeNames
        .map((n: string) => n.trim())
        .filter(Boolean);
    }
    if (Array.isArray(body.alternativeDomains)) {
      updates.alternativeDomains = body.alternativeDomains
        .map((d: string) =>
          d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase()
        )
        .filter(Boolean);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 }
      );
    }

    const competitor = await Competitor.findOneAndUpdate(
      { _id: competitorId, tenantId: workspaceId },
      updates,
      { new: true }
    ).lean();

    if (!competitor) {
      return NextResponse.json(
        { error: "Competitor not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      competitor: {
        id: competitor._id.toString(),
        name: competitor.name,
        domain: competitor.domain,
        alternativeNames: competitor.alternativeNames ?? [],
        alternativeDomains: competitor.alternativeDomains ?? [],
        color: competitor.color,
        notes: competitor.notes,
      },
    });
  } catch (error) {
    console.error("Error updating competitor:", error);
    return NextResponse.json(
      { error: "Failed to update competitor" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/[workspaceId]/competitors/[competitorId]
 */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, competitorId } = await params;
    await connectToDatabase();

    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const competitor = await Competitor.findOneAndDelete({
      _id: competitorId,
      tenantId: workspaceId,
    });

    if (!competitor) {
      return NextResponse.json(
        { error: "Competitor not found" },
        { status: 404 }
      );
    }

    // Remove from workspace's competitorDomains array
    await Workspace.updateOne(
      { _id: workspaceId },
      { $pull: { competitorDomains: competitor.domain } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting competitor:", error);
    return NextResponse.json(
      { error: "Failed to delete competitor" },
      { status: 500 }
    );
  }
}
