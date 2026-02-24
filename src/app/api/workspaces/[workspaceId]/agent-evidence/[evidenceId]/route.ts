import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import AgentEvidenceCache from "@/models/AgentEvidenceCache";
import AgentRequest from "@/models/AgentRequest";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/agent-evidence/[evidenceId]
 *
 * Returns the full AgentEvidenceCache document for a given evidence ID,
 * including matched pages, engine counts, purpose breakdown, sample request,
 * and feature contributions. Also enriches with recent raw agent requests.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ workspaceId: string; evidenceId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, evidenceId } = await params;
    await connectToDatabase();

    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    /* Fetch evidence cache doc */
    const evidence = await AgentEvidenceCache.findOne({
      _id: evidenceId,
      workspaceId,
    }).lean();

    if (!evidence) {
      return NextResponse.json(
        { error: "Evidence not found" },
        { status: 404 }
      );
    }

    /* Enrich with recent agent requests for matched page URLs */
    const matchedUrls = (evidence.matchedPages || []).map(
      (p: { url: string }) => p.url
    );
    const recentRequests =
      matchedUrls.length > 0
        ? await AgentRequest.find({
            tenantId: workspaceId,
            canonicalUrl: { $in: matchedUrls },
          })
            .sort({ timestamp: -1 })
            .limit(25)
            .lean()
        : [];

    const sanitizedRequests = recentRequests.map((r) => ({
      id: String(r._id),
      engine: r.engine,
      agentPurpose: r.agentPurpose,
      canonicalUrl: r.canonicalUrl,
      userAgent: r.userAgent,
      responseTimeMs: r.responseTimeMs,
      timestamp: r.timestamp,
      classificationConfidence: r.classificationConfidence,
    }));

    return NextResponse.json({
      evidence: {
        id: String(evidence._id),
        queryId: evidence.queryId,
        workspaceId: evidence.workspaceId,
        computedAt: evidence.computedAt,
        matchConfidence: evidence.matchConfidence,
        matchedPages: evidence.matchedPages,
        requestCountsByEngine: evidence.requestCountsByEngine,
        totalRequests: evidence.totalRequests,
        purposeBreakdown: evidence.purposeBreakdown,
        topSampleRequest: evidence.topSampleRequest,
        recencyHours: evidence.recencyHours,
        avgPageRelevance: evidence.avgPageRelevance,
        engineDistribution: evidence.engineDistribution,
        featureContributions: evidence.featureContributions,
        ttlExpiresAt: evidence.ttlExpiresAt,
      },
      recentRequests: sanitizedRequests,
    });
  } catch (error) {
    console.error("Agent evidence error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
