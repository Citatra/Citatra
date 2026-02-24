import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Invitation from "@/models/Invitation";
import User from "@/models/User";

export const runtime = 'nodejs';

// GET /api/workspaces/[workspaceId]/invitations - List pending invitations
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

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const invitations = await Invitation.find({
      workspaceId,
      status: "pending",
    }).sort({ createdAt: -1 });

    return NextResponse.json({
      invitations: invitations.map((inv) => ({
        id: inv._id.toString(),
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching invitations:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/[workspaceId]/invitations - Create an invitation
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
    const { email, role } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    // Check if current user is owner/admin
    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners/admins can invite members" },
        { status: 403 }
      );
    }

    // Check if user is already a member
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });
    if (existingUser) {
      const existingMembership = await Membership.findOne({
        userId: existingUser._id,
        workspaceId,
      });
      if (existingMembership) {
        return NextResponse.json(
          { error: "User is already a member of this workspace" },
          { status: 409 }
        );
      }
    }

    // Check for existing pending invitation
    const existingInvitation = await Invitation.findOne({
      email: email.toLowerCase(),
      workspaceId,
      status: "pending",
    });
    if (existingInvitation) {
      return NextResponse.json(
        { error: "An invitation has already been sent to this email" },
        { status: 409 }
      );
    }

    const token = uuidv4();
    const invitation = await Invitation.create({
      email: email.toLowerCase(),
      workspaceId,
      role: role || "viewer",
      token,
      invitedBy: session.user.id,
    });

    // In production, send email with invitation link here
    const inviteUrl = `${process.env.NEXTAUTH_URL}/invite/${token}`;

    return NextResponse.json(
      {
        invitation: {
          id: invitation._id.toString(),
          email: invitation.email,
          role: invitation.role,
          inviteUrl,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating invitation:", error);
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 }
    );
  }
}
