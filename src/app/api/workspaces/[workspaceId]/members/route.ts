import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import User from "@/models/User";

export const runtime = 'nodejs';

// GET /api/workspaces/[workspaceId]/members - List workspace members
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
    const currentMembership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });

    if (!currentMembership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const memberships = await Membership.find({ workspaceId });
    const userIds = memberships.map((m) => m.userId);
    const users = await User.find({ _id: { $in: userIds } }).select(
      "name email image"
    );

    const members = memberships.map((m) => {
      const user = users.find(
        (u) => u._id.toString() === m.userId.toString()
      );
      return {
        id: m._id.toString(),
        userId: m.userId.toString(),
        name: user?.name || "Unknown",
        email: user?.email || "",
        image: user?.image,
        role: m.role,
        joinedAt: m.joinedAt,
      };
    });

    return NextResponse.json({ members, currentRole: currentMembership.role });
  } catch (error) {
    console.error("Error fetching members:", error);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}
