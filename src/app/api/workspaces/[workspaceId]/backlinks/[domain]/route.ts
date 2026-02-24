import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import TrackingResult from "@/models/TrackingResult";
import Query from "@/models/Query";
import Source from "@/models/Source";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  GET /api/workspaces/[workspaceId]/backlinks/[domain]               */
/*  Domain detail drilldown — evidence, timeline, metadata             */
/* ------------------------------------------------------------------ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; domain: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, domain: rawDomain } = await params;
    const domain = decodeURIComponent(rawDomain);
    await connectToDatabase();

    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") || "90", 10);
    const since = new Date();
    since.setDate(since.getDate() - days);

    /* ── Get all tracking results for this domain ─────────────── */
    const results = (await TrackingResult.find({
      tenantId: workspaceId,
      sourceUrl: { $exists: true, $ne: "" },
      fetchedAt: { $gte: since },
    })
      .sort({ fetchedAt: -1 })
      .lean()) as unknown as Array<Record<string, unknown>>;

    /* Filter to only this domain */
    const domainResults = results.filter((r) => {
      try {
        const h = new URL(r.sourceUrl as string).hostname.replace(
          /^www\./,
          ""
        );
        return h === domain;
      } catch {
        return false;
      }
    });

    if (domainResults.length === 0) {
      return NextResponse.json(
        { error: "No data found for this domain" },
        { status: 404 }
      );
    }

    /* ── Collect query IDs for prompt text enrichment ─────────── */
    const queryIds = [
      ...new Set(
        domainResults
          .map((r) => String(r.queryId || ""))
          .filter(Boolean)
      ),
    ];
    const queryDocs = (await Query.find({
      _id: { $in: queryIds },
    })
      .select("_id queryText topic")
      .lean()) as unknown as Array<Record<string, unknown>>;
    const queryMap = new Map<string, { text: string; topic: string }>();
    for (const q of queryDocs) {
      queryMap.set(String(q._id), {
        text: (q.queryText as string) || "",
        topic: (q.topic as string) || "",
      });
    }

    /* ── Source metadata ──────────────────────────────────────── */
    const sourceDoc = (await Source.findOne({
      tenantId: workspaceId,
      domain,
    }).lean()) as unknown as Record<string, unknown> | null;

    /* ── Build evidence list ──────────────────────────────────── */
    interface EvidenceItem {
      trackingResultId: string;
      citedUrl: string;
      engine: string;
      excerpt: string;
      promptText: string;
      topic: string;
      sentiment: string;
      brandMentioned: boolean;
      sourcePosition: number;
      fetchedAt: string;
    }

    const evidence: EvidenceItem[] = domainResults.map((r) => {
      const qId = String(r.queryId || "");
      const q = queryMap.get(qId);
      return {
        trackingResultId: String(r._id),
        citedUrl: (r.sourceUrl as string) || "",
        engine: (r.engine as string) || "unknown",
        excerpt: ((r.contentSnippet as string) || "").substring(0, 300),
        promptText: q?.text || "",
        topic: q?.topic || "",
        sentiment: (r.sentiment as string) || "neutral",
        brandMentioned: !!(r.isBrandMentioned),
        sourcePosition: (r.sourcePosition as number) || 0,
        fetchedAt: r.fetchedAt
          ? new Date(r.fetchedAt as string).toISOString()
          : "",
      };
    });

    /* ── Timeline: daily citation counts ──────────────────────── */
    const timeline: Record<string, number> = {};
    for (const e of evidence) {
      const day = e.fetchedAt.slice(0, 10);
      if (day) timeline[day] = (timeline[day] || 0) + 1;
    }

    /* ── Engine breakdown ─────────────────────────────────────── */
    const engineBreakdown: Record<string, number> = {};
    for (const e of evidence) {
      engineBreakdown[e.engine] = (engineBreakdown[e.engine] || 0) + 1;
    }

    /* ── Sentiment breakdown ──────────────────────────────────── */
    const sentimentBreakdown: Record<string, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };
    for (const e of evidence) {
      sentimentBreakdown[e.sentiment] =
        (sentimentBreakdown[e.sentiment] || 0) + 1;
    }

    /* ── Cited URLs ───────────────────────────────────────────── */
    const urlCounts: Record<string, number> = {};
    for (const e of evidence) {
      urlCounts[e.citedUrl] = (urlCounts[e.citedUrl] || 0) + 1;
    }
    const citedUrls = Object.entries(urlCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([url, count]) => ({ url, count }));

    /* ── Top prompts triggering this domain ────────────────────── */
    const promptCounts: Record<string, number> = {};
    for (const e of evidence) {
      if (e.promptText) {
        promptCounts[e.promptText] =
          (promptCounts[e.promptText] || 0) + 1;
      }
    }
    const topPrompts = Object.entries(promptCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([prompt, count]) => ({ prompt, count }));

    /* ── Metadata from Source model ────────────────────────────── */
    const metadata = {
      domainType: (sourceDoc?.domainType as string) || "other",
      title: (sourceDoc?.title as string) || domain,
      totalCitations: (sourceDoc?.totalCitations as number) || evidence.length,
      mentionedBrands: (sourceDoc?.mentionedBrands as string[]) || [],
    };

    return NextResponse.json({
      domain,
      evidence: evidence.slice(0, 100), // cap at 100 evidence items
      totalEvidence: evidence.length,
      timeline,
      engineBreakdown,
      sentimentBreakdown,
      citedUrls,
      topPrompts,
      metadata,
    });
  } catch (error) {
    console.error("Backlink domain detail error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
