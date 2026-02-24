import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Workspace from "@/models/Workspace";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";
import Membership from "@/models/Membership";
import NotificationPreference from "@/models/NotificationPreference";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * GET /api/cron/weekly-digest
 *
 * Runs weekly — aggregates the past 7 days of tracking data per workspace
 * and sends a summary notification to users who have emailDigest enabled.
 */
export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const workspaces = await Workspace.find().lean();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let digestsSent = 0;

  for (const ws of workspaces) {
    const tenantId = String(ws._id);

    // Gather weekly stats
    const [activeQueries, weeklyResults, weeklyBrandMentions] =
      await Promise.all([
        Query.countDocuments({ tenantId, status: "active" }),
        TrackingResult.countDocuments({
          tenantId,
          fetchedAt: { $gte: sevenDaysAgo },
        }),
        TrackingResult.countDocuments({
          tenantId,
          fetchedAt: { $gte: sevenDaysAgo },
          isBrandMentioned: true,
        }),
      ]);

    // Queries newly with brand mentions this week
    const queriesWithBrand = await TrackingResult.distinct("queryId", {
      tenantId,
      fetchedAt: { $gte: sevenDaysAgo },
      isBrandMentioned: true,
    });

    const brandRate =
      weeklyResults > 0
        ? Math.round((weeklyBrandMentions / weeklyResults) * 100)
        : 0;

    // Find members who want email digest
    const memberships = await Membership.find({ workspaceId: tenantId }).lean();

    for (const mem of memberships) {
      const userId = String((mem as unknown as Record<string, unknown>).userId);

      const prefs = await NotificationPreference.findOne({
        userId,
        tenantId,
      }).lean();

      const wantDigest = prefs
        ? (prefs as unknown as Record<string, unknown>).emailDigest === true
        : false;

      if (!wantDigest) continue;

      const workspaceName = (ws as unknown as Record<string, unknown>).name as string;

      const message = [
        `Weekly summary for ${workspaceName}:`,
        `• ${activeQueries} active queries tracked`,
        `• ${weeklyResults} AI Overview results collected`,
        `• ${weeklyBrandMentions} brand mentions (${brandRate}% share)`,
        `• ${queriesWithBrand.length} queries with brand visibility`,
      ].join("\n");

      await createNotification({
        tenantId,
        userId,
        type: "weekly_digest",
        title: `Weekly Digest — ${workspaceName}`,
        message,
        metadata: {
          activeQueries,
          weeklyResults,
          weeklyBrandMentions,
          brandRate,
          queriesWithBrand: queriesWithBrand.length,
        },
      });

      digestsSent++;
    }
  }

  return NextResponse.json({
    success: true,
    workspacesProcessed: workspaces.length,
    digestsSent,
  });
}
