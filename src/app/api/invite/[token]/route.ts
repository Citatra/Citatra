import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Invitation from "@/models/Invitation";
import Membership from "@/models/Membership";
import User from "@/models/User";

export const runtime = 'nodejs';

// POST /api/invite/[token] - Accept an invitation
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "You must be signed in to accept an invitation" },
        { status: 401 }
      );
    }

    const { token } = await params;
    await connectToDatabase();

    const invitation = await Invitation.findOne({ token, status: "pending" });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invalid or expired invitation" },
        { status: 404 }
      );
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = "expired";
      await invitation.save();
      return NextResponse.json(
        { error: "This invitation has expired" },
        { status: 410 }
      );
    }

    // Get the user
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if email matches (optional: enforce email match)
    if (
      invitation.email.toLowerCase() !== user.email.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error: `This invitation was sent to ${invitation.email}. Please sign in with that email.`,
        },
        { status: 403 }
      );
    }

    // Check if already a member
    const existingMembership = await Membership.findOne({
      userId: session.user.id,
      workspaceId: invitation.workspaceId,
    });

    if (existingMembership) {
      invitation.status = "accepted";
      await invitation.save();
      return NextResponse.json({
        message: "You are already a member of this workspace",
        workspaceId: invitation.workspaceId.toString(),
      });
    }

    // Create membership
    await Membership.create({
      userId: session.user.id,
      workspaceId: invitation.workspaceId,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
      invitedAt: invitation.createdAt,
      joinedAt: new Date(),
    });

    // Mark invitation as accepted
    invitation.status = "accepted";
    await invitation.save();

    return NextResponse.json({
      message: "Invitation accepted successfully",
      workspaceId: invitation.workspaceId.toString(),
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}

// GET /api/invite/[token] - Get invitation details
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    await connectToDatabase();

    const invitation = await Invitation.findOne({ token }).populate({
      path: "workspaceId",
      select: "name",
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      invitation: {
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        workspaceName: (invitation.workspaceId as unknown as { name: string })
          ?.name,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    console.error("Error fetching invitation:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitation" },
      { status: 500 }
    );
  }
}
