import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";

export const runtime = 'nodejs';

// PATCH /api/workspaces/[workspaceId]/members/[memberId] - Update member role
export async function PATCH(
  req: Request,
  {
    params,
  }: { params: Promise<{ workspaceId: string; memberId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, memberId } = await params;
    await connectToDatabase();

    // Check if current user is owner/admin
    const currentMembership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });

    if (
      !currentMembership ||
      !["owner", "admin"].includes(currentMembership.role)
    ) {
      return NextResponse.json(
        { error: "Only owners/admins can update member roles" },
        { status: 403 }
      );
    }

    const { role } = await req.json();

    if (!["admin", "editor", "viewer"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const targetMembership = await Membership.findById(memberId);
    if (!targetMembership) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // Cannot change owner's role
    if (targetMembership.role === "owner") {
      return NextResponse.json(
        { error: "Cannot change owner's role" },
        { status: 400 }
      );
    }

    // Admin can't promote to admin (only owner can)
    if (currentMembership.role === "admin" && role === "admin") {
      return NextResponse.json(
        { error: "Only owners can promote to admin" },
        { status: 403 }
      );
    }

    targetMembership.role = role;
    await targetMembership.save();

    return NextResponse.json({
      member: {
        id: targetMembership._id.toString(),
        role: targetMembership.role,
      },
    });
  } catch (error) {
    console.error("Error updating member:", error);
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    );
  }
}

// DELETE /api/workspaces/[workspaceId]/members/[memberId] - Remove member
export async function DELETE(
  _req: Request,
  {
    params,
  }: { params: Promise<{ workspaceId: string; memberId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, memberId } = await params;
    await connectToDatabase();

    // Check if current user is owner/admin
    const currentMembership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });

    if (
      !currentMembership ||
      !["owner", "admin"].includes(currentMembership.role)
    ) {
      return NextResponse.json(
        { error: "Only owners/admins can remove members" },
        { status: 403 }
      );
    }

    const targetMembership = await Membership.findById(memberId);
    if (!targetMembership) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // Cannot remove owner
    if (targetMembership.role === "owner") {
      return NextResponse.json(
        { error: "Cannot remove workspace owner" },
        { status: 400 }
      );
    }

    await Membership.findByIdAndDelete(memberId);

    return NextResponse.json({ message: "Member removed" });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
