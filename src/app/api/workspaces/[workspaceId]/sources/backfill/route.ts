import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import TrackingResult from "@/models/TrackingResult";
import Source from "@/models/Source";
import Workspace from "@/models/Workspace";
import Competitor from "@/models/Competitor";
import {
  classifyDomain,
  classifyUrlType,
  extractDomain,
} from "@/lib/source-classifier";

export const runtime = "nodejs";

/**
 * POST /api/workspaces/[workspaceId]/sources/backfill
 *
 * Scans all existing TrackingResults for the workspace and upserts
 * corresponding Source documents.  Idempotent — safe to call repeatedly.
 */
export async function POST(
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

    const workspace = await Workspace.findById(workspaceId).lean();
    const competitors = await Competitor.find({ tenantId: workspaceId }).lean();
    const workspaceDomain = workspace?.domain || "";
    const competitorDomains = competitors.map((c) => c.domain);

    // Fetch all tracking results with a real sourceUrl
    const results = await TrackingResult.find({
      tenantId: workspaceId,
      sourceUrl: { $exists: true, $ne: "" },
    }).lean();

    let upserted = 0;

    for (const tr of results) {
      const url = tr.sourceUrl;
      if (!url || url === "no-source") continue;

      const domain = extractDomain(url);
      const domainType = classifyDomain(
        domain,
        workspaceDomain,
        competitorDomains
      );
      const urlType = classifyUrlType(url, (tr.metadata as Record<string, unknown>)?.sourceTitle as string || "");

      // Detect brands mentioned in the overview text
      const mentionedBrands: string[] = [];
      const overviewLower = (tr.overviewText || "").toLowerCase();
      if (
        workspaceDomain &&
        overviewLower.includes(
          workspaceDomain.replace(/^www\./, "").split(".")[0]
        )
      ) {
        mentionedBrands.push(workspaceDomain);
      }
      for (const cd of competitorDomains) {
        if (overviewLower.includes(cd.replace(/^www\./, "").split(".")[0])) {
          mentionedBrands.push(cd);
        }
      }

      try {
        await Source.findOneAndUpdate(
          { tenantId: workspaceId, url },
          {
            $set: {
              domain,
              domainType,
              urlType,
              title:
                (tr.metadata as Record<string, unknown>)?.sourceTitle as string || "",
              lastSeenAt: tr.fetchedAt,
            },
            $inc: {
              usedTotal: 1,
              totalCitations: 1,
            },
            $addToSet: {
              engines: tr.engine || "google_ai_overview",
              queryIds: tr.queryId,
              mentionedBrands: { $each: mentionedBrands },
            },
            $setOnInsert: {
              tenantId: workspaceId,
              url,
            },
          },
          { upsert: true }
        );
        upserted++;
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) {
          console.error(`[Backfill] Failed to upsert ${url}:`, err);
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      upserted,
    });
  } catch (error) {
    console.error("Sources backfill error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
