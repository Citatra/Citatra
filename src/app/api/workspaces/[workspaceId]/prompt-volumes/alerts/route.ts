import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import PromptVolumeAlert from "@/models/PromptVolumeAlert";
import Membership from "@/models/Membership";

export const runtime = "nodejs";

// GET /api/workspaces/[workspaceId]/prompt-volumes/alerts
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
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const alerts = await PromptVolumeAlert.find({ tenantId: workspaceId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      alerts: alerts.map((a) => ({
        id: a._id.toString(),
        name: a.name,
        triggerType: a.triggerType,
        topicId: a.topicId?.toString(),
        queryPattern: a.queryPattern,
        engines: a.engines,
        regions: a.regions,
        thresholdValue: a.thresholdValue,
        changePercent: a.changePercent,
        channels: a.channels,
        isActive: a.isActive,
        lastTriggeredAt: a.lastTriggeredAt,
        triggerCount: a.triggerCount,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching prompt volume alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

// POST /api/workspaces/[workspaceId]/prompt-volumes/alerts
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
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();

    if (!body.name || !body.triggerType) {
      return NextResponse.json(
        { error: "name and triggerType are required" },
        { status: 400 }
      );
    }

    const alert = await PromptVolumeAlert.create({
      tenantId: workspaceId,
      name: body.name,
      triggerType: body.triggerType,
      topicId: body.topicId,
      queryPattern: body.queryPattern,
      engines: body.engines || [],
      regions: body.regions || [],
      thresholdValue: body.thresholdValue,
      changePercent: body.changePercent,
      channels: body.channels || ["email"],
      webhookUrl: body.webhookUrl,
      slackWebhook: body.slackWebhook,
      email: body.email || session.user.email,
      createdBy: session.user.id,
    });

    return NextResponse.json(
      {
        id: alert._id.toString(),
        message: "Alert created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating prompt volume alert:", error);
    return NextResponse.json(
      { error: "Failed to create alert" },
      { status: 500 }
    );
  }
}

// DELETE /api/workspaces/[workspaceId]/prompt-volumes/alerts
export async function DELETE(
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
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const url = new URL(req.url);
    const alertId = url.searchParams.get("id");

    if (!alertId) {
      return NextResponse.json(
        { error: "Alert id is required" },
        { status: 400 }
      );
    }

    await PromptVolumeAlert.deleteOne({
      _id: alertId,
      tenantId: workspaceId,
    });

    return NextResponse.json({ message: "Alert deleted" });
  } catch (error) {
    console.error("Error deleting prompt volume alert:", error);
    return NextResponse.json(
      { error: "Failed to delete alert" },
      { status: 500 }
    );
  }
}

// PATCH /api/workspaces/[workspaceId]/prompt-volumes/alerts — toggle active state
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

    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership || membership.role === "viewer") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    if (!body.id) {
      return NextResponse.json(
        { error: "Alert id is required" },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {};
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;
    if (body.name) update.name = body.name;
    if (body.thresholdValue !== undefined)
      update.thresholdValue = body.thresholdValue;
    if (body.changePercent !== undefined)
      update.changePercent = body.changePercent;
    if (body.channels) update.channels = body.channels;

    await PromptVolumeAlert.updateOne(
      { _id: body.id, tenantId: workspaceId },
      { $set: update }
    );

    return NextResponse.json({ message: "Alert updated" });
  } catch (error) {
    console.error("Error updating prompt volume alert:", error);
    return NextResponse.json(
      { error: "Failed to update alert" },
      { status: 500 }
    );
  }
}
