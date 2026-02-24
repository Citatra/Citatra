import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Workspace from "@/models/Workspace";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";
import Competitor from "@/models/Competitor";
import { extractDomain, classifyDomain, classifyUrlType } from "@/lib/source-classifier";

export const runtime = "nodejs";

// ─── Scoring helpers ────────────────────────────────────────────────────

/** Normalise a value into 0-1 range given an array of all values */
function norm(value: number, allValues: number[]): number {
  const max = Math.max(...allValues, 1);
  return value / max;
}

function computeOpportunityScore(opts: {
  citationFreq: number;
  allCitationFreqs: number[];
  recencyMs: number;
  maxRecencyMs: number;
  engineCount: number;
  maxEngines: number;
  competitorCount: number;
  maxCompetitors: number;
  topicRelevance: number; // 0-1
  sourceUniqueness: number; // 0-1
}): number {
  const citationNorm = norm(opts.citationFreq, opts.allCitationFreqs);
  const recencyNorm = opts.maxRecencyMs > 0 ? 1 - opts.recencyMs / opts.maxRecencyMs : 0.5;
  const engineDiv = opts.maxEngines > 0 ? opts.engineCount / opts.maxEngines : 0;
  const compAuth = opts.maxCompetitors > 0 ? opts.competitorCount / opts.maxCompetitors : 0;

  return Math.round(
    100 *
      (0.3 * citationNorm +
        0.2 * Math.max(0, Math.min(1, recencyNorm)) +
        0.15 * engineDiv +
        0.15 * compAuth +
        0.1 * opts.topicRelevance +
        0.1 * opts.sourceUniqueness)
  );
}

function scoreBucket(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function suggestAction(opts: {
  competitorCitations: number;
  sourceCount: number;
  engineCount: number;
}): "Create content" | "Citation outreach" | "Syndicate" {
  if (opts.sourceCount === 0 || opts.competitorCitations <= 1) return "Create content";
  if (opts.engineCount >= 2) return "Syndicate";
  return "Citation outreach";
}

/**
 * GET /api/workspaces/[workspaceId]/competitive-gap
 *
 * Competitive AI Visibility Gap Analysis —
 * Identifies queries where competitors are cited in AI responses but the
 * workspace domain is not, scores each gap as an opportunity, and provides
 * actionable recommendations.
 *
 * Query params:
 *   days       = 7 | 30 | 90          (default 30)
 *   view       = "queries" | "domains" (default "queries")
 *   engine     = comma-separated filter
 *   competitor = comma-separated filter
 *   domainType = comma-separated filter (editorial, ugc, other)
 *   sort       = opportunity_score | recency | citations (default opportunity_score)
 *   page       = pagination (default 1)
 *   limit      = per page  (default 50, max 200)
 */
export async function GET(
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

    // ── Parse query params ──────────────────────────────────────────
    const url = new URL(req.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30"), 1), 365);
    const view = url.searchParams.get("view") || "queries";
    const engineFilter = url.searchParams.get("engine")?.split(",").filter(Boolean) || [];
    const competitorFilter = url.searchParams.get("competitor")?.split(",").filter(Boolean) || [];
    const domainTypeFilter = url.searchParams.get("domainType")?.split(",").filter(Boolean) || [];
    const sort = url.searchParams.get("sort") || "opportunity_score";
    const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50"), 1), 200);

    // ── Load workspace, competitors, queries ────────────────────────
    const workspace = await Workspace.findById(workspaceId).lean();
    const workspaceDomain = ((workspace?.domain as string) || "").replace(/^www\./, "").toLowerCase();

    const competitors = await Competitor.find({ tenantId: workspaceId }).lean();
    const competitorDomains = competitors.map((c) => c.domain.replace(/^www\./, "").toLowerCase());

    const queries = await Query.find({ tenantId: workspaceId, status: "active" }).lean();

    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // ── Fetch TrackingResults in window ─────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trFilter: Record<string, any> = {
      tenantId: workspaceId,
      fetchedAt: { $gte: sinceDate },
    };
    if (engineFilter.length > 0) {
      trFilter.engine = { $in: engineFilter };
    }

    const results = await TrackingResult.find(trFilter)
      .sort({ fetchedAt: -1 })
      .limit(5000)
      .lean();

    // ── Build per-query analysis ────────────────────────────────────
    // Map queryId -> results
    const resultsByQuery = new Map<string, typeof results>();
    for (const r of results) {
      const qid = String(r.queryId);
      if (!resultsByQuery.has(qid)) resultsByQuery.set(qid, []);
      resultsByQuery.get(qid)!.push(r);
    }

    const now = Date.now();
    const allEnginesSet = new Set<string>();
    for (const r of results) allEnginesSet.add(r.engine || "google_ai_overview");
    const allEngines = Array.from(allEnginesSet);

    // Pre-compute raw gap items for scoring normalisation
    interface RawGap {
      queryId: string;
      queryText: string;
      topic: string;
      competitorHits: Array<{
        domain: string;
        name: string;
        citations: number;
        exampleUrl: string;
      }>;
      engines: string[];
      recentCitations: number;
      latestFetchedAt: Date;
      topSources: Array<{
        url: string;
        title: string;
        domainType: string;
        urlType: string;
        lastSeenAt: string;
      }>;
    }

    const rawGaps: RawGap[] = [];

    for (const q of queries) {
      const qId = String(q._id);
      const qResults = resultsByQuery.get(qId) || [];
      if (qResults.length === 0) continue;

      // Check brand presence: workspace domain appears as sourceUrl
      const hasBrandSource = workspaceDomain
        ? qResults.some((r) => {
            const su = (r.sourceUrl || "").toLowerCase();
            return su.includes(workspaceDomain) || r.isBrandMentioned;
          })
        : false;

      // For each competitor, count citations
      const compHitsMap = new Map<string, { domain: string; name: string; citations: number; exampleUrl: string }>();
      for (const comp of competitors) {
        const cd = comp.domain.replace(/^www\./, "").toLowerCase();
        let citations = 0;
        let exampleUrl = "";
        for (const r of qResults) {
          const rd = (r.competitorDomain || "").replace(/^www\./, "").toLowerCase();
          const su = (r.sourceUrl || "").toLowerCase();
          if (rd.includes(cd) || su.includes(cd)) {
            citations++;
            if (!exampleUrl && r.sourceUrl) exampleUrl = r.sourceUrl;
          }
        }
        if (citations > 0) {
          compHitsMap.set(cd, {
            domain: cd,
            name: comp.name || cd,
            citations,
            exampleUrl,
          });
        }
      }

      // Only include if competitor cited AND brand NOT cited
      if (compHitsMap.size === 0 || hasBrandSource) continue;

      // Apply competitor filter
      if (competitorFilter.length > 0) {
        const hasFilteredComp = competitorFilter.some((f) => compHitsMap.has(f.replace(/^www\./, "").toLowerCase()));
        if (!hasFilteredComp) continue;
      }

      // Engines that cited competitors for this query
      const enginesForQuery = new Set<string>();
      for (const r of qResults) {
        const rd = (r.competitorDomain || "").replace(/^www\./, "").toLowerCase();
        const su = (r.sourceUrl || "").toLowerCase();
        if (competitorDomains.some((cd) => rd.includes(cd) || su.includes(cd))) {
          enginesForQuery.add(r.engine || "google_ai_overview");
        }
      }

      // Collect top source URLs from competitors
      const sourceMap = new Map<string, { url: string; title: string; domainType: string; urlType: string; lastSeenAt: Date }>();
      for (const r of qResults) {
        if (!r.sourceUrl) continue;
        const su = r.sourceUrl;
        const domain = extractDomain(su);
        if (!competitorDomains.some((cd) => domain.includes(cd))) continue;
        if (!sourceMap.has(su)) {
          const dType = classifyDomain(domain, workspaceDomain, competitorDomains);
          const uType = classifyUrlType(su, "");
          sourceMap.set(su, {
            url: su,
            title: ((r.metadata as Record<string, unknown>)?.sourceTitle as string) || "",
            domainType: dType,
            urlType: uType,
            lastSeenAt: r.fetchedAt,
          });
        }
      }

      // Apply domain type filter on sources
      let topSources = Array.from(sourceMap.values());
      if (domainTypeFilter.length > 0) {
        topSources = topSources.filter((s) => domainTypeFilter.includes(s.domainType));
        if (topSources.length === 0) continue;
      }

      const recentCitations = Array.from(compHitsMap.values()).reduce((sum, c) => sum + c.citations, 0);
      const latestFetchedAt = qResults.reduce((latest, r) => (r.fetchedAt > latest ? r.fetchedAt : latest), qResults[0].fetchedAt);

      rawGaps.push({
        queryId: qId,
        queryText: q.queryText,
        topic: q.topic || "",
        competitorHits: Array.from(compHitsMap.values()).sort((a, b) => b.citations - a.citations),
        engines: Array.from(enginesForQuery),
        recentCitations,
        latestFetchedAt,
        topSources: topSources.slice(0, 5).map((s) => ({
          ...s,
          lastSeenAt: s.lastSeenAt.toISOString(),
        })),
      });
    }

    // ── Score each gap ──────────────────────────────────────────────
    const allCitationFreqs = rawGaps.map((g) => g.recentCitations);
    const maxRecencyMs = days * 24 * 60 * 60 * 1000;

    const scoredGaps = rawGaps.map((g) => {
      const recencyMs = now - g.latestFetchedAt.getTime();
      const topicRelevance = g.topic ? 0.7 : 0.3; // queries with assigned topics are more relevant
      const sourceUniqueness = g.topSources.length > 0 ? Math.min(1, g.topSources.length / 5) : 0;

      const opportunityScore = computeOpportunityScore({
        citationFreq: g.recentCitations,
        allCitationFreqs,
        recencyMs,
        maxRecencyMs,
        engineCount: g.engines.length,
        maxEngines: allEngines.length,
        competitorCount: g.competitorHits.length,
        maxCompetitors: competitors.length || 1,
        topicRelevance,
        sourceUniqueness,
      });

      const bucket = scoreBucket(opportunityScore);
      const action = suggestAction({
        competitorCitations: g.recentCitations,
        sourceCount: g.topSources.length,
        engineCount: g.engines.length,
      });

      // Build confidence note
      let confidenceNotes = "";
      if (bucket === "high") {
        confidenceNotes = `Strong gap: ${g.competitorHits.length} competitor(s) cited across ${g.engines.length} engine(s)`;
      } else if (bucket === "medium") {
        confidenceNotes = `Moderate gap: competitors appear but limited engine diversity`;
      } else {
        confidenceNotes = `Low priority: few competitor citations detected`;
      }

      return {
        id: g.queryId,
        type: "query" as const,
        queryText: g.queryText,
        topic: g.topic,
        topCompetitorDomains: g.competitorHits,
        opportunityScore,
        opportunityBucket: bucket,
        recentCitations: g.recentCitations,
        engines: g.engines,
        topSources: g.topSources,
        suggestedAction: action,
        confidenceNotes,
        lastCheckedAt: g.latestFetchedAt.toISOString(),
      };
    });

    // ── Domain-level aggregation (view=domains) ─────────────────────
    if (view === "domains") {
      const domainAgg = new Map<
        string,
        {
          domain: string;
          name: string;
          queryCount: number;
          totalCitations: number;
          engines: Set<string>;
          queries: string[];
          topSources: typeof scoredGaps[0]["topSources"];
          latestChecked: string;
          sumScores: number;
        }
      >();

      for (const gap of scoredGaps) {
        for (const comp of gap.topCompetitorDomains) {
          let entry = domainAgg.get(comp.domain);
          if (!entry) {
            entry = {
              domain: comp.domain,
              name: comp.name,
              queryCount: 0,
              totalCitations: 0,
              engines: new Set(),
              queries: [],
              topSources: [],
              latestChecked: gap.lastCheckedAt,
              sumScores: 0,
            };
            domainAgg.set(comp.domain, entry);
          }
          entry.queryCount++;
          entry.totalCitations += comp.citations;
          for (const e of gap.engines) entry.engines.add(e);
          entry.queries.push(gap.queryText);
          entry.topSources.push(...gap.topSources);
          entry.sumScores += gap.opportunityScore;
          if (gap.lastCheckedAt > entry.latestChecked) entry.latestChecked = gap.lastCheckedAt;
        }
      }

      let domainItems = Array.from(domainAgg.values()).map((d) => {
        const avgScore = d.queryCount > 0 ? Math.round(d.sumScores / d.queryCount) : 0;
        // Deduplicate top sources
        const uniqueSources = new Map<string, typeof d.topSources[0]>();
        for (const s of d.topSources) uniqueSources.set(s.url, s);

        return {
          id: d.domain,
          type: "domain" as const,
          domain: d.domain,
          name: d.name,
          queryCount: d.queryCount,
          queries: d.queries.slice(0, 5),
          opportunityScore: avgScore,
          opportunityBucket: scoreBucket(avgScore),
          recentCitations: d.totalCitations,
          engines: Array.from(d.engines),
          topSources: Array.from(uniqueSources.values()).slice(0, 5),
          suggestedAction: suggestAction({
            competitorCitations: d.totalCitations,
            sourceCount: Array.from(uniqueSources.values()).length,
            engineCount: d.engines.size,
          }),
          confidenceNotes: `${d.queryCount} gap quer${d.queryCount === 1 ? "y" : "ies"} across ${d.engines.size} engine(s)`,
          lastCheckedAt: d.latestChecked,
        };
      });

      // Sort
      if (sort === "recency") domainItems.sort((a, b) => b.lastCheckedAt.localeCompare(a.lastCheckedAt));
      else if (sort === "citations") domainItems.sort((a, b) => b.recentCitations - a.recentCitations);
      else domainItems.sort((a, b) => b.opportunityScore - a.opportunityScore);

      const totalItems = domainItems.length;
      const totalPages = Math.ceil(totalItems / limit);
      domainItems = domainItems.slice((page - 1) * limit, page * limit);

      const highPriority = Array.from(domainAgg.values()).filter(
        (d) => scoreBucket(Math.round(d.sumScores / (d.queryCount || 1))) === "high"
      ).length;
      const avgScore =
        domainItems.length > 0
          ? Math.round(domainItems.reduce((s, d) => s + d.opportunityScore, 0) / domainItems.length)
          : 0;

      return NextResponse.json({
        items: domainItems,
        summary: {
          totalGaps: totalItems,
          highPriority,
          avgOpportunityScore: avgScore,
          brandDomain: workspaceDomain,
        },
        filters: {
          engines: allEngines,
          competitors: competitors.map((c) => ({ name: c.name, domain: c.domain.replace(/^www\./, "").toLowerCase() })),
        },
        pagination: { page, limit, totalItems, totalPages },
      });
    }

    // ── Query-level view (default) ──────────────────────────────────
    let sortedGaps = [...scoredGaps];
    if (sort === "recency") sortedGaps.sort((a, b) => b.lastCheckedAt.localeCompare(a.lastCheckedAt));
    else if (sort === "citations") sortedGaps.sort((a, b) => b.recentCitations - a.recentCitations);
    else sortedGaps.sort((a, b) => b.opportunityScore - a.opportunityScore);

    const totalItems = sortedGaps.length;
    const totalPages = Math.ceil(totalItems / limit);
    sortedGaps = sortedGaps.slice((page - 1) * limit, page * limit);

    const highPriority = scoredGaps.filter((g) => g.opportunityBucket === "high").length;
    const avgScore =
      scoredGaps.length > 0
        ? Math.round(scoredGaps.reduce((s, g) => s + g.opportunityScore, 0) / scoredGaps.length)
        : 0;

    return NextResponse.json({
      items: sortedGaps,
      summary: {
        totalGaps: totalItems,
        highPriority,
        avgOpportunityScore: avgScore,
        brandDomain: workspaceDomain,
      },
      filters: {
        engines: allEngines,
        competitors: competitors.map((c) => ({ name: c.name, domain: c.domain.replace(/^www\./, "").toLowerCase() })),
      },
      pagination: { page, limit, totalItems, totalPages },
    });
  } catch (error) {
    console.error("Competitive gap error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/workspaces/[workspaceId]/competitive-gap
 *
 * Export competitive gap data as CSV.
 */
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
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Only owner/admin can export" }, { status: 403 });
    }

    // Re-use GET logic by calling self
    const body = await req.json().catch(() => ({}));
    const days = body.days || 30;
    const view = body.view || "queries";

    const baseUrl = new URL(req.url);
    baseUrl.searchParams.set("days", String(days));
    baseUrl.searchParams.set("view", view);
    baseUrl.searchParams.set("limit", "1000");
    if (body.engine) baseUrl.searchParams.set("engine", body.engine);
    if (body.competitor) baseUrl.searchParams.set("competitor", body.competitor);
    if (body.domainType) baseUrl.searchParams.set("domainType", body.domainType);

    const getRes = await GET(new Request(baseUrl.toString(), { headers: req.headers }), { params });
    const data = await getRes.json();
    const items = data.items || [];

    // Build CSV
    const headers = [
      "Query",
      "Opportunity Score",
      "Priority",
      "Suggested Action",
      "Recent Citations",
      "Engines",
      "Top Competitors",
      "Top Source URLs",
      "Last Checked",
      "Notes",
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = items.map((item: any) => [
      `"${(item.queryText || item.domain || "").replace(/"/g, '""')}"`,
      item.opportunityScore,
      item.opportunityBucket,
      item.suggestedAction,
      item.recentCitations,
      `"${(item.engines || []).join(", ")}"`,
      `"${(item.topCompetitorDomains || []).map((c: { domain: string }) => c.domain).join(", ")}"`,
      `"${(item.topSources || []).map((s: { url: string }) => s.url).join(", ")}"`,
      item.lastCheckedAt,
      `"${(item.confidenceNotes || "").replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="competitive-gap-${workspaceId}-${days}d.csv"`,
      },
    });
  } catch (error) {
    console.error("Competitive gap export error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
