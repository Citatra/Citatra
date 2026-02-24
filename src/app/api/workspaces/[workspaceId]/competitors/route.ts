import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Competitor from "@/models/Competitor";
import Workspace from "@/models/Workspace";
import Membership from "@/models/Membership";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/competitors
 * List all competitors for this workspace.
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

    const competitors = await Competitor.find({ tenantId: workspaceId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      competitors: competitors.map((c) => ({
        id: c._id.toString(),
        name: c.name,
        domain: c.domain,
        alternativeNames: c.alternativeNames ?? [],
        alternativeDomains: c.alternativeDomains ?? [],
        color: c.color,
        notes: c.notes,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching competitors:", error);
    return NextResponse.json(
      { error: "Failed to fetch competitors" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/[workspaceId]/competitors
 * Add a new competitor domain.
 */
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, domain, color, notes, alternativeNames, alternativeDomains } = body;

    if (!name || !domain) {
      return NextResponse.json(
        { error: "name and domain are required" },
        { status: 400 }
      );
    }

    // Normalize domain
    const normalizedDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "")
      .toLowerCase();

    // Check duplicate
    const existing = await Competitor.findOne({
      tenantId: workspaceId,
      domain: normalizedDomain,
    });
    if (existing) {
      return NextResponse.json(
        { error: "This competitor domain is already tracked" },
        { status: 409 }
      );
    }

    // Check not same as workspace domain
    const workspace = await Workspace.findById(workspaceId);
    if (
      workspace?.domain &&
      normalizedDomain ===
        workspace.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase()
    ) {
      return NextResponse.json(
        { error: "Cannot add your own domain as a competitor" },
        { status: 400 }
      );
    }

    // Normalize alternative domains the same way
    const normalizedAltDomains = Array.isArray(alternativeDomains)
      ? alternativeDomains.map((d: string) =>
          d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "").toLowerCase()
        ).filter(Boolean)
      : [];

    const normalizedAltNames = Array.isArray(alternativeNames)
      ? alternativeNames.map((n: string) => n.trim()).filter(Boolean)
      : [];

    const competitor = await Competitor.create({
      tenantId: workspaceId,
      name: name.trim(),
      domain: normalizedDomain,
      alternativeNames: normalizedAltNames,
      alternativeDomains: normalizedAltDomains,
      color: color || "#6b7280",
      notes: notes || "",
      createdBy: session.user.id,
    });

    // Also keep the workspace.competitorDomains array in sync
    await Workspace.updateOne(
      { _id: workspaceId },
      { $addToSet: { competitorDomains: normalizedDomain } }
    );

    return NextResponse.json(
      {
        competitor: {
          id: competitor._id.toString(),
          name: competitor.name,
          domain: competitor.domain,
          alternativeNames: competitor.alternativeNames,
          alternativeDomains: competitor.alternativeDomains,
          color: competitor.color,
          notes: competitor.notes,
          createdAt: competitor.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating competitor:", error);
    return NextResponse.json(
      { error: "Failed to create competitor" },
      { status: 500 }
    );
  }
}
