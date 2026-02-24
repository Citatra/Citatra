import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Workspace from "@/models/Workspace";
import Membership from "@/models/Membership";

export const runtime = 'nodejs';

// GET /api/workspaces/[workspaceId] - Get workspace details
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

    // Check membership
    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      workspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        slug: workspace.slug,
        domain: workspace.domain,
        brandNames: workspace.brandNames || [],
        keywords: workspace.keywords,
        timezone: workspace.timezone,
        region: workspace.region || "us",
        language: workspace.language || "en",
        updateFrequency: workspace.updateFrequency || "daily",
        onboardingCompleted: workspace.onboardingCompleted,
        settings: workspace.settings,
        role: membership.role,
        createdAt: workspace.createdAt,
      },
    });
  } catch (error) {
    console.error("Error fetching workspace:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspace" },
      { status: 500 }
    );
  }
}

// PATCH /api/workspaces/[workspaceId] - Update workspace
export async function PATCH(
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

    // Only owner/admin can update
    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners/admins can update workspace settings" },
        { status: 403 }
      );
    }

    const updates = await req.json();

    // Prevent updating protected fields
    delete updates._id;
    delete updates.ownerId;

    const workspace = await Workspace.findByIdAndUpdate(
      workspaceId,
      { $set: updates },
      { new: true }
    );

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      workspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        slug: workspace.slug,
        domain: workspace.domain,
        brandNames: workspace.brandNames || [],
        keywords: workspace.keywords,
        timezone: workspace.timezone,
        region: workspace.region || "us",
        language: workspace.language || "en",
        updateFrequency: workspace.updateFrequency || "daily",
        onboardingCompleted: workspace.onboardingCompleted,
        settings: workspace.settings,
      },
    });
  } catch (error) {
    console.error("Error updating workspace:", error);
    return NextResponse.json(
      { error: "Failed to update workspace" },
      { status: 500 }
    );
  }
}

// DELETE /api/workspaces/[workspaceId] - Delete workspace
export async function DELETE(
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

    // Only owner can delete
    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });

    if (!membership || membership.role !== "owner") {
      return NextResponse.json(
        { error: "Only workspace owners can delete workspaces" },
        { status: 403 }
      );
    }

    await Workspace.findByIdAndDelete(workspaceId);
    await Membership.deleteMany({ workspaceId });

    return NextResponse.json({ message: "Workspace deleted" });
  } catch (error) {
    console.error("Error deleting workspace:", error);
    return NextResponse.json(
      { error: "Failed to delete workspace" },
      { status: 500 }
    );
  }
}
