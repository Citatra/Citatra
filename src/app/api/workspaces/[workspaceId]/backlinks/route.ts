import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import TrackingResult from "@/models/TrackingResult";
import Source from "@/models/Source";

export const runtime = "nodejs";

/* ------------------------------------------------------------------ */
/*  Scoring weights (must sum to 1)                                    */
/* ------------------------------------------------------------------ */
const W = {
  citationFreq: 0.25,
  temporalConsistency: 0.2,
  brandMentionRate: 0.15,
  sourceAuthority: 0.15,
  contextualRelevance: 0.1,
  sentimentImpact: 0.075,
  aiRelevance: 0.075,
} as const;

const ENGINE_WEIGHTS: Record<string, number> = {
  google_ai_overview: 1.0,
  perplexity: 0.9,
  bing_chat: 0.7,
  chatgpt: 0.6,
};

function bucket(score: number): "high" | "medium" | "low" {
  if (score >= 85) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function domSentiment(
  counts: Record<string, number>
): "positive" | "neutral" | "negative" {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (sorted[0]?.[0] as "positive" | "neutral" | "negative") || "neutral";
}

/* ------------------------------------------------------------------ */
/*  GET /api/workspaces/[workspaceId]/backlinks                        */
/*  Enhanced AI Citation Authority & Relevance scoring                 */
/* ------------------------------------------------------------------ */
export async function GET(
  req: NextRequest,
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

    /* ── Query params ─────────────────────────────────────────── */
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") || "90", 10);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10))
    );
    const sort = url.searchParams.get("sort") || "qualityScore";
    const sortDir = url.searchParams.get("sortDir") === "asc" ? 1 : -1;
    const minScore = parseInt(url.searchParams.get("minScore") || "0", 10);
    const engineFilter = url.searchParams.get("engine") || "";
    const sentimentFilter = url.searchParams.get("sentiment") || "";
    const search = (url.searchParams.get("search") || "").toLowerCase();

    const since = new Date();
    since.setDate(since.getDate() - days);

    /* ── Fetch tracking results ───────────────────────────────── */
    const matchStage: Record<string, unknown> = {
      tenantId: workspaceId,
      sourceUrl: { $exists: true, $ne: "" },
      fetchedAt: { $gte: since },
    };
    if (engineFilter) matchStage.engine = engineFilter;
    if (sentimentFilter) matchStage.sentiment = sentimentFilter;

    const results = (await TrackingResult.find(matchStage)
      .sort({ fetchedAt: -1 })
      .lean()) as unknown as Array<Record<string, unknown>>;

    /* ── Also pull Source docs for domainType enrichment ──────── */
    const sourcesByDomain = new Map<string, string>();
    const sourceDocs = (await Source.find({ tenantId: workspaceId })
      .select("domain domainType")
      .lean()) as unknown as Array<Record<string, unknown>>;
    for (const s of sourceDocs) {
      if (s.domain && s.domainType) {
        sourcesByDomain.set(s.domain as string, s.domainType as string);
      }
    }

    /* ── Group by domain ──────────────────────────────────────── */
    interface DomainAcc {
      urls: Set<string>;
      citations: number;
      brandMentions: number;
      sentiments: Record<string, number>;
      firstSeen: Date;
      lastSeen: Date;
      snippets: string[];
      engines: Record<string, number>;
      days: Set<string>;
      positions: number[];
    }

    const domainMap = new Map<string, DomainAcc>();

    for (const r of results) {
      const sourceUrl = (r.sourceUrl as string) || "";
      if (!sourceUrl) continue;

      let domain: string;
      try {
        domain = new URL(sourceUrl).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }

      const acc: DomainAcc = domainMap.get(domain) || {
        urls: new Set<string>(),
        citations: 0,
        brandMentions: 0,
        sentiments: {},
        firstSeen: new Date(),
        lastSeen: new Date(0),
        snippets: [],
        engines: {},
        days: new Set<string>(),
        positions: [],
      };

      acc.urls.add(sourceUrl);
      acc.citations += 1;

      if (r.isBrandMentioned) acc.brandMentions += 1;

      const sent = (r.sentiment as string) || "neutral";
      acc.sentiments[sent] = (acc.sentiments[sent] || 0) + 1;

      if (r.contentSnippet) acc.snippets.push(r.contentSnippet as string);

      const eng = (r.engine as string) || "unknown";
      acc.engines[eng] = (acc.engines[eng] || 0) + 1;

      const fetchDate = new Date(r.fetchedAt as string);
      if (fetchDate < acc.firstSeen) acc.firstSeen = fetchDate;
      if (fetchDate > acc.lastSeen) acc.lastSeen = fetchDate;

      acc.days.add(fetchDate.toISOString().slice(0, 10));

      if (typeof r.sourcePosition === "number") {
        acc.positions.push(r.sourcePosition as number);
      }

      domainMap.set(domain, acc);
    }

    /* ── Compute global max citations for normalization ────────── */
    let maxCitations = 1;
    for (const acc of domainMap.values()) {
      if (acc.citations > maxCitations) maxCitations = acc.citations;
    }

    /* ── Compute daily citation map (last 90 days) for sparklines */
    const dayIndex = new Map<string, number>();
    for (let i = 0; i < Math.min(days, 90); i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dayIndex.set(d.toISOString().slice(0, 10), 0);
    }

    /* ── Score each domain ────────────────────────────────────── */
    interface ScoredDomain {
      domain: string;
      firstCitedUrl: string;
      citedUrls: string[];
      citationCount: number;
      citationsByEngine: Record<string, number>;
      brandMentions: number;
      sentimentCounts: Record<string, number>;
      dominantSentiment: string;
      distinctCitationDays: number;
      firstSeen: string;
      lastSeen: string;
      scoreCitationFreq: number;
      scoreTemporalConsistency: number;
      scoreBrandMentionRate: number;
      scoreSourceAuthority: number;
      scoreContextualRelevance: number;
      scoreSentimentImpact: number;
      scoreAiRelevance: number;
      qualityScore: number;
      qualityBucket: string;
      aiRelevancePercent: number;
      domainType: string;
      dailyCitations: Record<string, number>;
      sampleSnippet: string;
      topEngines: string[];
    }

    const scored: ScoredDomain[] = [];

    for (const [domain, acc] of domainMap.entries()) {
      /* 1. Citation Frequency (0–1) — log-scaled relative to max */
      const citationFreq = Math.min(
        1,
        Math.log1p(acc.citations) / Math.log1p(maxCitations)
      );

      /* 2. Temporal Consistency (0–1) — distinct days / total possible days */
      const possibleDays = Math.max(
        1,
        Math.ceil(
          (acc.lastSeen.getTime() - acc.firstSeen.getTime()) / 86400000
        ) + 1
      );
      const temporalConsistency = Math.min(
        1,
        acc.days.size / Math.min(possibleDays, days)
      );

      /* 3. Brand Mention Rate (0–1) */
      const brandMentionRate =
        acc.citations > 0 ? acc.brandMentions / acc.citations : 0;

      /* 4. Source Authority (0–1) — derived from domainType heuristic */
      const dt = sourcesByDomain.get(domain) || "other";
      const authorityMap: Record<string, number> = {
        institutional: 0.95,
        reference: 0.85,
        editorial: 0.75,
        corporate: 0.65,
        competitor: 0.4,
        ugc: 0.3,
        other: 0.5,
      };
      const sourceAuthority = authorityMap[dt] ?? 0.5;

      /* 5. Contextual Relevance (0–1) — placeholder: inverse avg position */
      const avgPos =
        acc.positions.length > 0
          ? acc.positions.reduce((a, b) => a + b, 0) / acc.positions.length
          : 5;
      const contextualRelevance = Math.max(0, Math.min(1, 1 - avgPos / 20));

      /* 6. Sentiment Impact (0–1) — positive-leaning score */
      const totalSent =
        (acc.sentiments.positive || 0) +
        (acc.sentiments.neutral || 0) +
        (acc.sentiments.negative || 0);
      const sentimentImpact =
        totalSent > 0
          ? ((acc.sentiments.positive || 0) * 1.0 +
              (acc.sentiments.neutral || 0) * 0.5 +
              (acc.sentiments.negative || 0) * 0.0) /
            totalSent
          : 0.5;

      /* 7. AI Relevance (0–1) — engine-weighted citations */
      let weightedCitations = 0;
      for (const [eng, cnt] of Object.entries(acc.engines)) {
        weightedCitations += cnt * (ENGINE_WEIGHTS[eng] ?? 0.5);
      }
      const aiRelevance = Math.min(
        1,
        weightedCitations / Math.max(1, maxCitations)
      );

      /* Composite quality score (0–100) */
      const composite =
        citationFreq * W.citationFreq +
        temporalConsistency * W.temporalConsistency +
        brandMentionRate * W.brandMentionRate +
        sourceAuthority * W.sourceAuthority +
        contextualRelevance * W.contextualRelevance +
        sentimentImpact * W.sentimentImpact +
        aiRelevance * W.aiRelevance;
      const qualityScore = Math.round(composite * 100);

      /* Sparkline daily citations */
      const dailyCitations: Record<string, number> = {};
      for (const d of dayIndex.keys()) {
        dailyCitations[d] = 0;
      }
      for (const d of acc.days) {
        if (dailyCitations[d] !== undefined) {
          dailyCitations[d] = (dailyCitations[d] || 0) + 1;
        }
      }

      /* Top engines sorted by count */
      const topEngines = Object.entries(acc.engines)
        .sort((a, b) => b[1] - a[1])
        .map(([e]) => e);

      const urlsArr = Array.from(acc.urls);

      scored.push({
        domain,
        firstCitedUrl: urlsArr[0] || "",
        citedUrls: urlsArr,
        citationCount: acc.citations,
        citationsByEngine: acc.engines,
        brandMentions: acc.brandMentions,
        sentimentCounts: acc.sentiments,
        dominantSentiment: domSentiment(acc.sentiments),
        distinctCitationDays: acc.days.size,
        firstSeen: acc.firstSeen.toISOString(),
        lastSeen: acc.lastSeen.toISOString(),
        scoreCitationFreq: Math.round(citationFreq * 100) / 100,
        scoreTemporalConsistency:
          Math.round(temporalConsistency * 100) / 100,
        scoreBrandMentionRate: Math.round(brandMentionRate * 100) / 100,
        scoreSourceAuthority: Math.round(sourceAuthority * 100) / 100,
        scoreContextualRelevance:
          Math.round(contextualRelevance * 100) / 100,
        scoreSentimentImpact: Math.round(sentimentImpact * 100) / 100,
        scoreAiRelevance: Math.round(aiRelevance * 100) / 100,
        qualityScore,
        qualityBucket: bucket(qualityScore),
        aiRelevancePercent: Math.round(aiRelevance * 100),
        domainType: dt,
        dailyCitations,
        sampleSnippet: acc.snippets[0]?.substring(0, 200) || "",
        topEngines,
      });
    }

    /* ── Apply search filter ──────────────────────────────────── */
    let filtered = scored;
    if (search) {
      filtered = filtered.filter((d) => d.domain.includes(search));
    }
    if (minScore > 0) {
      filtered = filtered.filter((d) => d.qualityScore >= minScore);
    }

    /* ── Sort ─────────────────────────────────────────────────── */
    const sortKey = sort as keyof ScoredDomain;
    filtered.sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * sortDir;
      }
      return String(va).localeCompare(String(vb)) * sortDir;
    });

    /* ── Pagination ───────────────────────────────────────────── */
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    /* ── Summary KPIs ─────────────────────────────────────────── */
    const allCitations = scored.reduce((s, d) => s + d.citationCount, 0);
    const avgQuality =
      scored.length > 0
        ? Math.round(
            scored.reduce((s, d) => s + d.qualityScore, 0) / scored.length
          )
        : 0;
    const highCount = scored.filter((d) => d.qualityBucket === "high").length;
    const mediumCount = scored.filter(
      (d) => d.qualityBucket === "medium"
    ).length;
    const lowCount = scored.filter((d) => d.qualityBucket === "low").length;

    /* Top engine by total citations */
    const engineTotals: Record<string, number> = {};
    for (const d of scored) {
      for (const [eng, cnt] of Object.entries(d.citationsByEngine)) {
        engineTotals[eng] = (engineTotals[eng] || 0) + cnt;
      }
    }
    const topEngine =
      Object.entries(engineTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";

    /* Quality distribution for chart */
    const qualityDistribution = [
      { range: "85-100", label: "High", count: highCount },
      { range: "60-84", label: "Medium", count: mediumCount },
      { range: "0-59", label: "Low", count: lowCount },
    ];

    /* Engine breakdown for chart */
    const engineBreakdown = Object.entries(engineTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([engine, citations]) => ({ engine, citations }));

    /* Sentiment breakdown */
    const sentimentTotals: Record<string, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };
    for (const d of scored) {
      for (const [s, c] of Object.entries(d.sentimentCounts)) {
        sentimentTotals[s] = (sentimentTotals[s] || 0) + c;
      }
    }

    /* Domain type breakdown */
    const domainTypeCounts: Record<string, number> = {};
    for (const d of scored) {
      domainTypeCounts[d.domainType] =
        (domainTypeCounts[d.domainType] || 0) + 1;
    }
    const domainTypeBreakdown = Object.entries(domainTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    const summary = {
      totalSources: scored.length,
      totalCitations: allCitations,
      avgQuality,
      highQuality: highCount,
      mediumQuality: mediumCount,
      lowQuality: lowCount,
      topEngine,
      qualityDistribution,
      engineBreakdown,
      sentimentTotals,
      domainTypeBreakdown,
    };

    return NextResponse.json({
      backlinks: paginated,
      summary,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error("Backlinks error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
