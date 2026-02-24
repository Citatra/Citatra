import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import NotificationPreference from "@/models/NotificationPreference";
import Membership from "@/models/Membership";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/notification-preferences
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

    let prefs = await NotificationPreference.findOne({
      userId: session.user.id,
      tenantId: workspaceId,
    }).lean();

    const defaults = {
      emailOnMention: true,
      emailOnDrop: true,
      emailDigest: false,
      slackWebhookUrl: "",
      slackOnMention: false,
      slackOnDrop: false,
    };

    const p = prefs || defaults;

    return NextResponse.json({
      preferences: {
        emailOnMention: p.emailOnMention,
        emailOnDrop: p.emailOnDrop,
        emailDigest: p.emailDigest,
        slackWebhookUrl: p.slackWebhookUrl || "",
        slackOnMention: p.slackOnMention,
        slackOnDrop: p.slackOnDrop,
      },
    });
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workspaces/[workspaceId]/notification-preferences
 */
export async function PUT(
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
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const update = {
      emailOnMention: Boolean(body.emailOnMention),
      emailOnDrop: Boolean(body.emailOnDrop),
      emailDigest: Boolean(body.emailDigest),
      slackWebhookUrl: body.slackWebhookUrl || "",
      slackOnMention: Boolean(body.slackOnMention),
      slackOnDrop: Boolean(body.slackOnDrop),
    };

    await NotificationPreference.findOneAndUpdate(
      { userId: session.user.id, tenantId: workspaceId },
      { ...update, userId: session.user.id, tenantId: workspaceId },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, preferences: update });
  } catch (error) {
    console.error("Error saving notification preferences:", error);
    return NextResponse.json(
      { error: "Failed to save preferences" },
      { status: 500 }
    );
  }
}
