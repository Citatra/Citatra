import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";
import Workspace from "@/models/Workspace";
import AgentRequest from "@/models/AgentRequest";
import AgentAggregate from "@/models/AgentAggregate";
import AgentEvidenceCache from "@/models/AgentEvidenceCache";
import AttributionDaily from "@/models/AttributionDaily";
import AttributionModelMetrics from "@/models/AttributionModelMetrics";
import Page from "@/models/Page";
import {
  testGA4Connection,
  fetchGA4AITraffic,
  fetchGA4DailySummary,
  type GA4Config,
} from "@/lib/ga4";
import {
  ENGINE_WEIGHTS,
  PAGE_TYPE_CTR_MULTIPLIER,
} from "@/lib/agent-classifier";
import {
  tokenize,
  buildIdfMap,
  matchQueryToPages,
  type MatchCandidate,
} from "@/lib/query-page-matcher";

export const runtime = "nodejs";

/* ================================================================== */
/*  Constants & types                                                  */
/* ================================================================== */

/** Attribution modes — user can force a mode or let auto choose */
type AttributionMode = "auto" | "ga4" | "model" | "heuristic";

/** Confidence tiers */
function confidenceTier(c: number): "high" | "medium" | "low" {
  if (c >= 0.7) return "high";
  if (c >= 0.4) return "medium";
  return "low";
}

interface GA4Settings {
  propertyId?: string;
  clientEmail?: string;
  privateKey?: string;
  connected?: boolean;
  lastSync?: string;
}

interface FeatureContribution {
  name: string;
  value: number;
  contribution: number;
}

interface AgentEvidence {
  evidenceId: string | null;
  requestCount: number;
  topAgentEngines: Array<{ engine: string; count: number }>;
  topAgentTypes: Array<{ purpose: string; count: number }>;
  matchConfidence: number;
  matchedPages: Array<{
    canonicalUrl: string;
    confidence: number;
    agentRequests: number;
  }>;
  sampleRequest?: {
    timestamp: string;
    engine: string;
    userAgent: string;
    responseTimeMs: number;
  };
  recencyHours: number;
  avgPageRelevance: number;
  engineDistribution: Record<string, number>;
}

/** Per-query attribution row returned by the API */
interface QueryAttributionRow {
  queryId: string;
  queryText: string;
  searchVolume: number;
  visibilityRate: number;
  estimatedTraffic: number;
  estimatedConversions: number;
  totalResults: number;
  brandMentions: number;
  positiveRate: number;
  /** Which model produced these numbers */
  modelSource: "ga4" | "model" | "heuristic";
  /** Composite confidence 0–1 */
  confidence: number;
  /** Human-readable tier */
  confidenceTier: "high" | "medium" | "low";
  /** SHAP-style explainability */
  explainability: { featureContributions: FeatureContribution[] };
  /** Pointer to AgentEvidenceCache doc */
  agentEvidenceRef: string | null;
  /** Inline agent evidence (light) */
  agentEvidence: AgentEvidence | null;
  /** Legacy — kept for backwards compat */
  source?: string;
  matchConfidence?: number;
}

/* ================================================================== */
/*  Helpers — page matching & agent evidence                           */
/* ================================================================== */

async function buildMatchCandidates(
  workspaceId: string
): Promise<{ candidates: MatchCandidate[]; idfMap: Map<string, number> }> {
  const pages = await Page.find({ tenantId: workspaceId }).lean();
  const candidates: MatchCandidate[] = pages.map((p) => ({
    canonicalUrl: p.canonicalUrl,
    slug: p.slug || "",
    title: p.title || "",
    pageType: p.pageType || "other",
    embedding: p.embedding || [],
    tokens: tokenize(
      `${p.title} ${p.canonicalKeywords?.join(" ") || ""} ${p.slug}`
    ),
    recentAgentRequests: p.totalAgentRequests || 0,
    recentAgentEngines: Object.keys(p.engineRequestCounts || {}),
  }));
  const corpus = candidates.map((c) => c.tokens);
  const idfMap = buildIdfMap(corpus);
  return { candidates, idfMap };
}

async function computeAgentEvidence(
  workspaceId: string,
  queryId: string,
  queryText: string,
  candidates: MatchCandidate[],
  idfMap: Map<string, number>,
  windowDays: number
): Promise<AgentEvidence> {
  const windowStart = new Date(Date.now() - windowDays * 86400000);
  const matches = matchQueryToPages(queryText, null, candidates, idfMap, 5, 0.1);

  if (matches.length === 0) {
    return {
      evidenceId: null,
      requestCount: 0,
      topAgentEngines: [],
      topAgentTypes: [],
      matchConfidence: 0,
      matchedPages: [],
      recencyHours: Infinity,
      avgPageRelevance: 0,
      engineDistribution: {},
    };
  }

  const matchedUrls = matches.map((m) => m.canonicalUrl);
  const agentRequests = await AgentRequest.find({
    tenantId: workspaceId,
    canonicalUrl: { $in: matchedUrls },
    timestamp: { $gte: windowStart },
  })
    .sort({ timestamp: -1 })
    .lean();

  const engineCounts: Record<string, number> = {};
  const purposeCounts: Record<string, number> = {};
  for (const ar of agentRequests) {
    engineCounts[ar.engine] = (engineCounts[ar.engine] || 0) + 1;
    purposeCounts[ar.agentPurpose] = (purposeCounts[ar.agentPurpose] || 0) + 1;
  }

  const topAgentEngines = Object.entries(engineCounts)
    .map(([engine, count]) => ({ engine, count }))
    .sort((a, b) => b.count - a.count);

  const topAgentTypes = Object.entries(purposeCounts)
    .map(([purpose, count]) => ({ purpose, count }))
    .sort((a, b) => b.count - a.count);

  const totalReqs = agentRequests.length;
  const engineDistribution: Record<string, number> = {};
  for (const [eng, cnt] of Object.entries(engineCounts)) {
    engineDistribution[eng] = totalReqs > 0 ? Math.round((cnt / totalReqs) * 100) / 100 : 0;
  }

  const sample = agentRequests[0];
  const recencyHours = sample
    ? (Date.now() - new Date(sample.timestamp).getTime()) / 3600000
    : Infinity;

  const sampleRequest = sample
    ? {
        timestamp: new Date(sample.timestamp).toISOString(),
        engine: sample.engine,
        userAgent: sample.userAgent,
        responseTimeMs: sample.responseTimeMs,
      }
    : undefined;

  const matchedPages = matches.map((m) => {
    const pageRequests = agentRequests.filter(
      (ar) => ar.canonicalUrl === m.canonicalUrl
    ).length;
    return {
      canonicalUrl: m.canonicalUrl,
      confidence: Math.round(m.matchConfidence * 100) / 100,
      agentRequests: pageRequests,
    };
  });

  const avgPageRelevance =
    matches.length > 0
      ? Math.round(
          (matches.reduce((s, m) => s + m.matchConfidence, 0) / matches.length) *
            100
        ) / 100
      : 0;

  /* Upsert into AgentEvidenceCache */
  const reqByEngine: Record<string, number> = {};
  for (const [eng, cnt] of Object.entries(engineCounts)) reqByEngine[eng] = cnt;

  let evidenceId: string | null = null;
  try {
    const cached = await AgentEvidenceCache.findOneAndUpdate(
      { workspaceId, queryId },
      {
        $set: {
          computedAt: new Date(),
          matchConfidence:
            matches.length > 0
              ? Math.round(matches[0].matchConfidence * 100) / 100
              : 0,
          matchedPages: matches.map((m) => ({
            url: m.canonicalUrl,
            relevanceScore: Math.round(m.matchConfidence * 100) / 100,
          })),
          requestCountsByEngine: reqByEngine,
          totalRequests: totalReqs,
          purposeBreakdown: purposeCounts,
          topSampleRequest: sampleRequest
            ? {
                timestamp: new Date(sampleRequest.timestamp),
                engine: sampleRequest.engine,
                userAgent: sampleRequest.userAgent,
                responseTimeMs: sampleRequest.responseTimeMs,
                excerpt: "",
              }
            : undefined,
          recencyHours: Math.round(recencyHours * 10) / 10,
          avgPageRelevance,
          engineDistribution,
          ttlExpiresAt: new Date(Date.now() + 48 * 3600000),
        },
      },
      { upsert: true, new: true }
    );
    evidenceId = cached ? String(cached._id) : null;
  } catch {
    /* non-fatal — evidence still returned inline */
  }

  return {
    evidenceId,
    requestCount: totalReqs,
    topAgentEngines,
    topAgentTypes,
    matchConfidence:
      matches.length > 0
        ? Math.round(matches[0].matchConfidence * 100) / 100
        : 0,
    matchedPages,
    sampleRequest,
    recencyHours: Math.round(recencyHours * 10) / 10,
    avgPageRelevance,
    engineDistribution,
  };
}

/* ================================================================== */
/*  Explainability — feature contribution builder                      */
/* ================================================================== */

function buildExplainability(
  visibilityRate: number,
  searchVolume: number,
  agentEvidence: AgentEvidence | null,
  estimatedTraffic: number,
  modelSource: string
): FeatureContribution[] {
  const contribs: FeatureContribution[] = [];

  /* Visibility contribution */
  const visContrib = estimatedTraffic > 0 ? Math.round((visibilityRate / 100) * estimatedTraffic) : 0;
  contribs.push({ name: "visibility", value: visibilityRate, contribution: visContrib });

  /* Search volume contribution */
  const volContrib = estimatedTraffic > 0 ? Math.round((searchVolume / Math.max(searchVolume, 1)) * estimatedTraffic * 0.3) : 0;
  contribs.push({ name: "searchVolume", value: searchVolume, contribution: volContrib });

  if (agentEvidence && agentEvidence.requestCount > 0) {
    /* Agent request count contribution */
    const agentContrib = Math.round(agentEvidence.requestCount * 0.5);
    contribs.push({ name: "agentRequests", value: agentEvidence.requestCount, contribution: agentContrib });

    /* Recency contribution */
    const recencyBoost = agentEvidence.recencyHours < 24 ? 5 : agentEvidence.recencyHours < 72 ? 2 : 0;
    contribs.push({ name: "recency", value: Math.round(agentEvidence.recencyHours), contribution: recencyBoost });

    /* Page relevance */
    const relContrib = Math.round(agentEvidence.avgPageRelevance * estimatedTraffic * 0.2);
    contribs.push({ name: "pageRelevance", value: agentEvidence.avgPageRelevance, contribution: relContrib });

    /* Per-engine contributions */
    for (const { engine, count } of agentEvidence.topAgentEngines.slice(0, 3)) {
      const weights = ENGINE_WEIGHTS[engine] || ENGINE_WEIGHTS.unknown;
      const engContrib = Math.round(count * (weights?.baseCTR || 0.03) * searchVolume * 0.01);
      contribs.push({ name: `engine_${engine}`, value: count, contribution: engContrib });
    }
  }

  if (modelSource === "ga4") {
    contribs.push({ name: "ga4_grounded", value: 1, contribution: 0 });
  }

  return contribs.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

/* ================================================================== */
/*  Traffic computation helpers                                        */
/* ================================================================== */

function computeModelEstimates(
  searchVolume: number,
  visibilityRate: number,
  agentEvidence: AgentEvidence,
  pageType: string
): { estimatedTraffic: number; estimatedConversions: number } {
  const ALPHA = 0.3;
  const BASE_CVR = 0.02;
  let totalEstClicks = 0;

  for (const { engine, count } of agentEvidence.topAgentEngines) {
    const weights = ENGINE_WEIGHTS[engine] || ENGINE_WEIGHTS.unknown;
    const pageMultiplier = PAGE_TYPE_CTR_MULTIPLIER[pageType] || 1.0;
    const engineExposure =
      agentEvidence.requestCount > 0 ? count / agentEvidence.requestCount : 0;
    const estClicks =
      searchVolume *
      (visibilityRate / 100) *
      weights.baseCTR *
      pageMultiplier *
      weights.shareEstimate *
      (1 + ALPHA * engineExposure * count);
    totalEstClicks += estClicks;
  }

  if (agentEvidence.topAgentEngines.length === 0) {
    totalEstClicks = searchVolume * (visibilityRate / 100) * 0.03;
  }

  /* Recency decay bonus */
  if (agentEvidence.recencyHours < 24) {
    totalEstClicks *= 1.15;
  } else if (agentEvidence.recencyHours < 72) {
    totalEstClicks *= 1.05;
  }

  const estimatedTraffic = Math.round(totalEstClicks);
  const estimatedConversions = Math.round(
    totalEstClicks * BASE_CVR * (PAGE_TYPE_CTR_MULTIPLIER[pageType] || 1.0)
  );
  return { estimatedTraffic, estimatedConversions };
}

function computeCompositeConfidence(
  pageMatchConfidence: number,
  agentEvidenceConfidence: number,
  temporalCloseness: number,
  ga4Matched: boolean
): number {
  const w = ga4Matched
    ? { page: 0.2, agent: 0.2, temporal: 0.1, ga4: 0.5 }
    : { page: 0.4, agent: 0.4, temporal: 0.2, ga4: 0 };

  const composite =
    pageMatchConfidence * w.page +
    agentEvidenceConfidence * w.agent +
    temporalCloseness * w.temporal +
    (ga4Matched ? 1 : 0) * w.ga4;

  return Math.round(Math.min(1, composite) * 100) / 100;
}

/* ================================================================== */
/*  GET — Traffic attribution (hybrid: GA4 / model / heuristic)        */
/* ================================================================== */

/**
 * GET /api/workspaces/[workspaceId]/traffic-attribution
 *
 * Query params:
 *   mode               – "auto"|"ga4"|"model"|"heuristic" (default auto)
 *   since              – ISO date start (default 30 days ago)
 *   to                 – ISO date end (default now)
 *   minMatchConfidence – float 0–1 (default 0.1)
 *   agentWindowDays    – int (default 30)
 *   page               – pagination page (default 1)
 *   limit              – rows per page (default 50)
 *   sort               – sort field (default estimatedTraffic)
 *   sortDir            – asc|desc (default desc)
 *   search             – filter by query text substring
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

    /* ── Parse query params ───────────────────────────────────── */
    const { searchParams } = new URL(_req.url);
    const mode = (searchParams.get("mode") || "auto") as AttributionMode;
    const minMatchConfidence = parseFloat(
      searchParams.get("minMatchConfidence") || "0.1"
    );
    const agentWindowDays = parseInt(
      searchParams.get("agentWindowDays") || "30",
      10
    );
    const pageNum = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const sort = searchParams.get("sort") || "estimatedTraffic";
    const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;
    const searchFilter = (searchParams.get("search") || "").toLowerCase();

    const now = new Date();
    const since = searchParams.get("since")
      ? new Date(searchParams.get("since")!)
      : new Date(now.getTime() - 30 * 86400000);
    const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : now;

    /* ── Workspace & GA4 config ───────────────────────────────── */
    const workspace = (await Workspace.findById(workspaceId).lean()) as unknown as Record<
      string,
      unknown
    >;
    const settings = (workspace?.settings as Record<string, unknown>) || {};
    const ga4 = (settings.ga4 as GA4Settings) || {};
    const ga4Connected = !!(ga4.connected && ga4.propertyId);

    /* ── Load queries + tracking results ──────────────────────── */
    const queries = (await Query.find({ tenantId: workspaceId }).lean()) as unknown as Array<
      Record<string, unknown>
    >;
    const results = (await TrackingResult.find({
      tenantId: workspaceId,
      fetchedAt: { $gte: since, $lte: to },
    })
      .sort({ fetchedAt: -1 })
      .lean()) as unknown as Array<Record<string, unknown>>;

    /* ── Build page-matching candidates ───────────────────────── */
    const { candidates, idfMap } = await buildMatchCandidates(workspaceId);
    const hasAgentData = candidates.length > 0;

    /* ── Load daily agent aggregates ──────────────────────────── */
    const aggResults = await AgentAggregate.find({
      tenantId: workspaceId,
      date: { $gte: since.toISOString().split("T")[0] },
    }).lean();

    const dateAggMap = new Map<string, { requestCount: number; engines: Record<string, number> }>();
    for (const agg of aggResults) {
      const existing = dateAggMap.get(agg.date) || { requestCount: 0, engines: {} };
      existing.requestCount += agg.requestCount;
      existing.engines[agg.engine] = (existing.engines[agg.engine] || 0) + agg.requestCount;
      dateAggMap.set(agg.date, existing);
    }
    const dailyAgentAggs = Array.from(dateAggMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    /* ── Model metrics for the monitoring panel ───────────────── */
    const latestModelMetrics = (await AttributionModelMetrics.findOne({
      workspaceId,
    })
      .sort({ date: -1 })
      .lean()) as unknown as Record<string, unknown> | null;

    /* ── Pre-aggregated daily counts (from AttributionDaily) ──── */
    const preAggDays = (await AttributionDaily.find({
      workspaceId,
      date: { $gte: since.toISOString().split("T")[0] },
    })
      .lean()) as unknown as Array<Record<string, unknown>>;

    /* ── Determine effective mode ─────────────────────────────── */
    let effectiveMode: "ga4" | "model" | "heuristic" = "heuristic";
    if (mode === "ga4" && ga4Connected) effectiveMode = "ga4";
    else if (mode === "model" && hasAgentData) effectiveMode = "model";
    else if (mode === "heuristic") effectiveMode = "heuristic";
    else if (mode === "auto") {
      if (ga4Connected) effectiveMode = "ga4";
      else if (hasAgentData) effectiveMode = "model";
      else effectiveMode = "heuristic";
    }

    /* ================================================================ */
    /*  ATTRIBUTION COMPUTATION — shared across modes                    */
    /* ================================================================ */

    /** Try GA4 data if mode requires */
    let lpTraffic: Record<string, { sessions: number; conversions: number; users: number; pageViews: number }> | null = null;
    let ga4DailySummary: Array<Record<string, unknown>> | null = null;
    let ga4AiTraffic: { totals: Record<string, number>; dateRange: { startDate: string; endDate: string } } | null = null;

    if (effectiveMode === "ga4" && ga4Connected) {
      try {
        const ga4Config: GA4Config = {
          propertyId: ga4.propertyId!,
          credentials:
            ga4.clientEmail && ga4.privateKey
              ? { clientEmail: ga4.clientEmail, privateKey: ga4.privateKey }
              : undefined,
        };
        const dayDiff = Math.ceil((to.getTime() - since.getTime()) / 86400000);
        const [aiTraffic, dailySummary] = await Promise.all([
          fetchGA4AITraffic(ga4Config, dayDiff),
          fetchGA4DailySummary(ga4Config, dayDiff),
        ]);
        lpTraffic = {};
        for (const row of aiTraffic.rows) {
          const lp = row.landingPage.toLowerCase();
          if (!lpTraffic[lp]) lpTraffic[lp] = { sessions: 0, conversions: 0, users: 0, pageViews: 0 };
          lpTraffic[lp].sessions += row.sessions;
          lpTraffic[lp].conversions += row.conversions;
          lpTraffic[lp].users += row.totalUsers;
          lpTraffic[lp].pageViews += row.screenPageViews;
        }
        ga4DailySummary = dailySummary as unknown as Array<Record<string, unknown>>;
        ga4AiTraffic = { totals: aiTraffic.totals, dateRange: aiTraffic.dateRange };
      } catch (ga4Error) {
        console.error("GA4 fetch failed, falling back:", ga4Error);
        effectiveMode = hasAgentData ? "model" : "heuristic";
      }
    }

    /* ── Per-query attribution ────────────────────────────────── */
    const AI_CTR = 0.03;
    const CVR = 0.02;
    const MODEL_VERSION = "v1.0";

    const allAttribution: QueryAttributionRow[] = await Promise.all(
      queries.map(async (q) => {
        const qId = String(q._id);
        const queryText = q.queryText as string;
        const searchVolume = (q.searchVolume as number) || 0;

        const qResults = results.filter((r) => String(r.queryId) === qId);
        const avgVisibility = qResults.length > 0
          ? Math.round(qResults.reduce((sum, r) => sum + ((r.brandTextVisibility as number) || 0), 0) / qResults.length)
          : 0;
        const visibilityRate = avgVisibility;

        const sentiments: Record<string, number> = {};
        for (const r of qResults) {
          const s = (r.sentiment as string) || "neutral";
          sentiments[s] = (sentiments[s] || 0) + 1;
        }
        const positiveRate =
          qResults.length > 0 ? Math.round(((sentiments.positive || 0) / qResults.length) * 100) : 0;

        /* ── Agent evidence (always computed for explainability) ──── */
        let agentEvidence: AgentEvidence | null = null;
        if (hasAgentData) {
          agentEvidence = await computeAgentEvidence(
            workspaceId,
            qId,
            queryText,
            candidates,
            idfMap,
            agentWindowDays
          );
        }

        /* ── Compute traffic by effective mode ────────────────────── */
        let estimatedTraffic = 0;
        let estimatedConversions = 0;
        let modelSource: "ga4" | "model" | "heuristic" = effectiveMode;
        let compositeConfidence = 0;

        if (effectiveMode === "ga4" && lpTraffic) {
          /* GA4 — match landing pages to query */
          const querySlug = queryText.toLowerCase().replace(/\s+/g, "-");
          let matchedSessions = 0;
          let matchedConversions = 0;
          let ga4Matched = false;

          for (const [lp, data] of Object.entries(lpTraffic)) {
            const queryWords = queryText.toLowerCase().split(/\s+/);
            const matchCount = queryWords.filter((w) => lp.includes(w)).length;
            if (matchCount >= Math.ceil(queryWords.length * 0.5) || lp.includes(querySlug)) {
              matchedSessions += data.sessions;
              matchedConversions += data.conversions;
              ga4Matched = true;
            }
          }

          /* Confidence-based attenuation */
          const pageConf = agentEvidence?.matchConfidence || 0;
          const agentConf = agentEvidence && agentEvidence.requestCount > 0 ? Math.min(1, agentEvidence.requestCount / 50) : 0;
          const temporalClose = agentEvidence && agentEvidence.recencyHours < 72 ? 1 : agentEvidence && agentEvidence.recencyHours < 168 ? 0.5 : 0;

          compositeConfidence = computeCompositeConfidence(pageConf, agentConf, temporalClose, ga4Matched);

          if (compositeConfidence < minMatchConfidence) {
            matchedSessions = Math.round(matchedSessions * 0.3);
            matchedConversions = Math.round(matchedConversions * 0.3);
          }

          estimatedTraffic = matchedSessions;
          estimatedConversions = matchedConversions;
          modelSource = agentEvidence && agentEvidence.requestCount > 0 ? "ga4" : "ga4";
        } else if (effectiveMode === "model" && agentEvidence && agentEvidence.requestCount > 0) {
          /* Agent-grounded model */
          const bestMatch = agentEvidence.matchedPages[0];
          const matchedPage = bestMatch
            ? candidates.find((c) => c.canonicalUrl === bestMatch.canonicalUrl)
            : undefined;
          const pageType = matchedPage?.pageType || "other";

          const est = computeModelEstimates(searchVolume, visibilityRate, agentEvidence, pageType);
          estimatedTraffic = est.estimatedTraffic;
          estimatedConversions = est.estimatedConversions;
          modelSource = "model";

          const pageConf = agentEvidence.matchConfidence;
          const agentConf = Math.min(1, agentEvidence.requestCount / 50);
          const temporalClose = agentEvidence.recencyHours < 72 ? 1 : agentEvidence.recencyHours < 168 ? 0.5 : 0;
          compositeConfidence = computeCompositeConfidence(pageConf, agentConf, temporalClose, false);
        } else {
          /* Heuristic fallback */
          const vis = visibilityRate / 100;
          estimatedTraffic = Math.round(searchVolume * vis * AI_CTR);
          estimatedConversions = Math.round(estimatedTraffic * CVR);
          modelSource = "heuristic";
          compositeConfidence = Math.min(0.3, visibilityRate / 100);
        }

        /* ── Explainability ───────────────────────────────────────── */
        const explainability = {
          featureContributions: buildExplainability(
            visibilityRate,
            searchVolume,
            agentEvidence,
            estimatedTraffic,
            modelSource
          ),
        };

        return {
          queryId: qId,
          queryText,
          searchVolume,
          visibilityRate,
          estimatedTraffic,
          estimatedConversions,
          totalResults: qResults.length,
          brandMentions: qResults.filter((r) => ((r.brandTextVisibility as number) || 0) > 0).length,
          positiveRate,
          modelSource,
          confidence: compositeConfidence,
          confidenceTier: confidenceTier(compositeConfidence),
          explainability,
          agentEvidenceRef: agentEvidence?.evidenceId || null,
          agentEvidence,
          source: modelSource,
          matchConfidence: agentEvidence?.matchConfidence || 0,
        } satisfies QueryAttributionRow;
      })
    );

    /* ── Apply search filter ──────────────────────────────────── */
    let filtered = allAttribution;
    if (searchFilter) {
      filtered = filtered.filter((a) => a.queryText.toLowerCase().includes(searchFilter));
    }

    /* ── Sort ─────────────────────────────────────────────────── */
    const sortKey = sort as keyof QueryAttributionRow;
    filtered.sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sortDir;
      return String(va).localeCompare(String(vb)) * sortDir;
    });

    /* ── Pagination ───────────────────────────────────────────── */
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const paginated = filtered.slice((pageNum - 1) * limit, pageNum * limit);

    /* ── Daily funnel ─────────────────────────────────────────── */
    const dayDiff = Math.ceil((to.getTime() - since.getTime()) / 86400000);
    const dailyFunnel: Array<Record<string, unknown>> = [];

    if (effectiveMode === "ga4" && ga4DailySummary) {
      for (const day of ga4DailySummary) {
        const dayStr =
          (day.date as string).length === 8
            ? `${(day.date as string).slice(0, 4)}-${(day.date as string).slice(4, 6)}-${(day.date as string).slice(6, 8)}`
            : (day.date as string);
        const agentDay = dailyAgentAggs.find((a) => a.date === dayStr);
        const dayResults = results.filter(
          (r) => new Date(r.fetchedAt as string).toISOString().split("T")[0] === dayStr
        );
        const dayVisSum = dayResults.reduce((sum, r) => sum + ((r.brandTextVisibility as number) || 0), 0);
        const dayVis = dayResults.length > 0 ? Math.round(dayVisSum / dayResults.length) : 0;

        dailyFunnel.push({
          date: dayStr,
          visibility: dayVis,
          estimatedClicks: (day.sessions as number) || 0,
          estimatedConversions: (day.conversions as number) || 0,
          realUsers: (day.users as number) || 0,
          realPageViews: (day.pageViews as number) || 0,
          engagementRate: Math.round(((day.engagementRate as number) || 0) * 100),
          agentRequests: agentDay?.requestCount || 0,
          agentEngines: agentDay?.engines || {},
        });
      }
    } else {
      const totalVolume = queries.reduce((sum, q) => sum + ((q.searchVolume as number) || 0), 0);
      for (let d = dayDiff - 1; d >= 0; d--) {
        const dayStart = new Date(now.getTime() - d * 86400000);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);
        const dateStr = dayStart.toISOString().split("T")[0];

        const dayResults = results.filter((r) => {
          const t = new Date(r.fetchedAt as string).getTime();
          return t >= dayStart.getTime() && t <= dayEnd.getTime();
        });
        const dayVisSum = dayResults.reduce((sum, r) => sum + ((r.brandTextVisibility as number) || 0), 0);
        const dayVis = dayResults.length > 0 ? dayVisSum / dayResults.length / 100 : 0;
        const agentDay = dailyAgentAggs.find((a) => a.date === dateStr);

        const dailyTraffic =
          effectiveMode === "model"
            ? Math.round(
                (totalVolume / dayDiff) *
                  dayVis *
                  0.04 *
                  (1 + 0.3 * (agentDay ? Math.min(agentDay.requestCount / 10, 1) : 0))
              )
            : Math.round((totalVolume / dayDiff) * dayVis * AI_CTR);

        dailyFunnel.push({
          date: dateStr,
          visibility: Math.round(dayVis * 100),
          estimatedClicks: dailyTraffic,
          estimatedConversions: Math.round(dailyTraffic * CVR),
          agentRequests: agentDay?.requestCount || 0,
          agentEngines: agentDay?.engines || {},
        });
      }
    }

    /* ── Summary KPIs ─────────────────────────────────────────── */
    const totalTraffic = allAttribution.reduce((s, a) => s + a.estimatedTraffic, 0);
    const totalConv = allAttribution.reduce((s, a) => s + a.estimatedConversions, 0);
    const avgVis =
      allAttribution.length > 0
        ? Math.round(allAttribution.reduce((s, a) => s + a.visibilityRate, 0) / allAttribution.length)
        : 0;
    const avgConfidence =
      allAttribution.length > 0
        ? Math.round((allAttribution.reduce((s, a) => s + a.confidence, 0) / allAttribution.length) * 100) / 100
        : 0;
    const highConfCount = allAttribution.filter((a) => a.confidenceTier === "high").length;
    const medConfCount = allAttribution.filter((a) => a.confidenceTier === "medium").length;
    const lowConfCount = allAttribution.filter((a) => a.confidenceTier === "low").length;

    const pctWithAgentEvidence =
      allAttribution.length > 0
        ? Math.round(
            (allAttribution.filter((a) => a.agentEvidence && a.agentEvidence.requestCount > 0).length /
              allAttribution.length) *
              100
          )
        : 0;

    const summary = {
      totalQueries: queries.length,
      totalSearchVolume: queries.reduce((sum, q) => sum + ((q.searchVolume as number) || 0), 0),
      totalEstimatedTraffic: totalTraffic,
      totalEstimatedConversions: totalConv,
      avgVisibility: avgVis,
      avgConfidence,
      confidenceBreakdown: { high: highConfCount, medium: medConfCount, low: lowConfCount },
      pctWithAgentEvidence,
      totalAgentRequests: dailyAgentAggs.reduce((s, d) => s + d.requestCount, 0),
      agentPagesTracked: candidates.length,
      ga4Totals: ga4AiTraffic?.totals || null,
      preAggDaysAvailable: preAggDays.length,
    };

    /* ── Model metadata ───────────────────────────────────────── */
    const model = {
      source: effectiveMode,
      requestedMode: mode,
      modelVersion: MODEL_VERSION,
      propertyId: ga4Connected ? ga4.propertyId : undefined,
      dateRange: ga4AiTraffic?.dateRange || {
        startDate: since.toISOString().split("T")[0],
        endDate: to.toISOString().split("T")[0],
      },
      note:
        effectiveMode === "ga4"
          ? hasAgentData
            ? "Real GA4 data enhanced with AI agent access evidence for higher-precision attribution."
            : "Showing real Google Analytics 4 data correlated with AI visibility tracking."
          : effectiveMode === "model"
          ? "Estimates powered by AI agent access evidence and engine-aware CTR modeling. Connect GA4 for real traffic data."
          : "These are estimated metrics. Connect Google Analytics 4 or start ingesting agent requests for better attribution.",
      agentAware: hasAgentData,
      agentWindowDays,
      modelMetrics: latestModelMetrics
        ? {
            modelVersion: latestModelMetrics.modelVersion,
            rmse: latestModelMetrics.rmse,
            bias: latestModelMetrics.bias,
            r2: latestModelMetrics.r2,
            mae: latestModelMetrics.mae,
            sampleSize: latestModelMetrics.sampleSize,
            driftDetected: latestModelMetrics.driftDetected,
            date: latestModelMetrics.date,
          }
        : null,
    };

    return NextResponse.json({
      attribution: paginated,
      dailyFunnel,
      summary,
      model,
      ga4Connected,
      pagination: { page: pageNum, limit, total, totalPages },
    });
  } catch (error) {
    console.error("Traffic attribution error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* ================================================================== */
/*  POST — Connect / disconnect / test GA4                             */
/* ================================================================== */

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
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { action, propertyId, clientEmail, privateKey } = body as {
      action: "connect-ga4" | "disconnect-ga4" | "test-ga4";
      propertyId?: string;
      clientEmail?: string;
      privateKey?: string;
    };

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const wsSettings = (workspace.settings as Record<string, unknown>) || {};

    if (action === "connect-ga4") {
      if (!propertyId) {
        return NextResponse.json(
          { error: "propertyId is required" },
          { status: 400 }
        );
      }

      const ga4Config: GA4Config = {
        propertyId,
        credentials:
          clientEmail && privateKey ? { clientEmail, privateKey } : undefined,
      };

      const testResult = await testGA4Connection(ga4Config);

      if (!testResult.success) {
        return NextResponse.json(
          { success: false, message: testResult.message, latency: testResult.latency },
          { status: 400 }
        );
      }

      const ga4Settings: GA4Settings = {
        propertyId,
        clientEmail: clientEmail || undefined,
        privateKey: privateKey || undefined,
        connected: true,
        lastSync: new Date().toISOString(),
      };

      workspace.settings = { ...wsSettings, ga4: ga4Settings };
      await workspace.save();

      return NextResponse.json({
        success: true,
        message: testResult.message,
        propertyName: testResult.propertyName,
        latency: testResult.latency,
      });
    }

    if (action === "disconnect-ga4") {
      workspace.settings = { ...wsSettings, ga4: { connected: false } };
      await workspace.save();
      return NextResponse.json({ success: true, message: "GA4 disconnected successfully" });
    }

    if (action === "test-ga4") {
      const ga4s = (wsSettings.ga4 as GA4Settings) || {};
      if (!ga4s.propertyId || !ga4s.connected) {
        return NextResponse.json({ error: "GA4 is not connected" }, { status: 400 });
      }

      const ga4Config: GA4Config = {
        propertyId: ga4s.propertyId,
        credentials:
          ga4s.clientEmail && ga4s.privateKey
            ? { clientEmail: ga4s.clientEmail, privateKey: ga4s.privateKey }
            : undefined,
      };

      const testResult = await testGA4Connection(ga4Config);
      return NextResponse.json({
        success: testResult.success,
        message: testResult.message,
        latency: testResult.latency,
        propertyName: testResult.propertyName,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Traffic attribution POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
