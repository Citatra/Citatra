import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Workspace from "@/models/Workspace";
import Membership from "@/models/Membership";
import { MAX_WORKSPACES } from "@/lib/enterprise";

export const runtime = 'nodejs';

// GET /api/workspaces - List user's workspaces
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const memberships = await Membership.find({ userId: session.user.id });
    const workspaceIds = memberships.map((m) => m.workspaceId);
    const workspaces = await Workspace.find({ _id: { $in: workspaceIds } });

    const workspacesWithRoles = workspaces.map((ws) => {
      const membership = memberships.find(
        (m) => m.workspaceId.toString() === ws._id.toString()
      );
      return {
        id: ws._id.toString(),
        name: ws.name,
        slug: ws.slug,
        domain: ws.domain,
        brandNames: ws.brandNames || [],
        keywords: ws.keywords,
        timezone: ws.timezone,
        region: ws.region,
        updateFrequency: ws.updateFrequency,
        onboardingCompleted: ws.onboardingCompleted,
        role: membership?.role,
        createdAt: ws.createdAt,
      };
    });

    return NextResponse.json({ workspaces: workspacesWithRoles });
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}

// POST /api/workspaces - Create a new workspace
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, domain } = await req.json();

    if (!name) {
      return NextResponse.json(
        { error: "Workspace name is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // ── Enforce workspace limit ──────────────────────────────────────
    const existingMemberships = await Membership.find({ userId: session.user.id });
    if (existingMemberships.length >= MAX_WORKSPACES) {
      return NextResponse.json(
        {
          error: "limit_exceeded",
          message: `The open-source version is limited to ${MAX_WORKSPACES} workspace${MAX_WORKSPACES === 1 ? "" : "s"}. You already have ${existingMemberships.length}.`,
        },
        { status: 403 }
      );
    }

    const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;

    const workspace = await Workspace.create({
      name,
      slug,
      domain: domain || undefined,
      ownerId: session.user.id,
    });

    await Membership.create({
      userId: session.user.id,
      workspaceId: workspace._id,
      role: "owner",
      joinedAt: new Date(),
    });

    return NextResponse.json(
      {
        workspace: {
          id: workspace._id.toString(),
          name: workspace.name,
          slug: workspace.slug,
          domain: workspace.domain,
          role: "owner",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating workspace:", error);
    return NextResponse.json(
      { error: "Failed to create workspace" },
      { status: 500 }
    );
  }
}
