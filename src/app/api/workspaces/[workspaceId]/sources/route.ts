import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import TrackingResult from "@/models/TrackingResult";
import Membership from "@/models/Membership";
import Workspace from "@/models/Workspace";
import Competitor from "@/models/Competitor";
import mongoose from "mongoose";
import {
  classifyDomain,
  classifyUrlType,
  extractDomain,
} from "@/lib/source-classifier";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/sources
 *
 * Full Sources analytics — domain-level and URL-level analysis.
 * Derives everything directly from TrackingResult documents so data
 * is always available without a separate Source collection or backfill.
 *
 * Query params:
 *   view        = "domains" | "urls"  (default "domains")
 *   days        = 7 | 14 | 30 | 90    (default 7)
 *   domainType  = comma-separated filter
 *   urlType     = comma-separated filter
 *   gap         = "1" to enable gap analysis
 *   search      = free-text filter
 *   page        = pagination (default 1)
 *   limit       = per page (default 50, max 200)
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

    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "domains";
    const days = Math.min(
      Math.max(parseInt(url.searchParams.get("days") || "7"), 1),
      90
    );
    const domainTypeFilter = url.searchParams
      .get("domainType")
      ?.split(",")
      .filter(Boolean);
    const urlTypeFilter = url.searchParams
      .get("urlType")
      ?.split(",")
      .filter(Boolean);
    const gapAnalysis = url.searchParams.get("gap") === "1";
    const searchText = url.searchParams.get("search") || "";
    const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "50"), 1),
      200
    );

    const workspace = await Workspace.findById(workspaceId).lean();
    const competitors = await Competitor.find({
      tenantId: workspaceId,
    }).lean();
    const competitorDomains = competitors.map((c) =>
      c.domain.replace(/^www\./, "").toLowerCase()
    );
    const workspaceDomain = (workspace?.domain || "")
      .replace(/^www\./, "")
      .toLowerCase();

    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const tenantObjId = new mongoose.Types.ObjectId(workspaceId);

    // ── Build the enriched URL list from TrackingResult ─────────────

    // 1. Get all TrackingResults with a real sourceUrl in the time window
    const trackingResults = await TrackingResult.find({
      tenantId: tenantObjId,
      fetchedAt: { $gte: sinceDate },
      sourceUrl: { $exists: true, $ne: "" },
    }).lean();

    // 2. Count total unique AI responses (unique queryId+fetchedAt+engine)
    const responseKeys = new Set<string>();
    for (const tr of trackingResults) {
      responseKeys.add(
        `${tr.queryId}|${tr.fetchedAt.toISOString()}|${tr.engine}`
      );
    }
    // Also count responses with no sourceUrl
    const noSourceResults = await TrackingResult.find({
      tenantId: tenantObjId,
      fetchedAt: { $gte: sinceDate },
      $or: [{ sourceUrl: "" }, { sourceUrl: { $exists: false } }],
    }).lean();
    for (const tr of noSourceResults) {
      responseKeys.add(
        `${tr.queryId}|${tr.fetchedAt.toISOString()}|${tr.engine}`
      );
    }
    const totalResponses = Math.max(responseKeys.size, 1);

    // 3. Build enriched URL map: group TrackingResults by sourceUrl
    interface UrlEntry {
      url: string;
      domain: string;
      domainType: string;
      urlType: string;
      title: string;
      /** Unique AI response sessions (queryId+fetchedAt+engine) that included this URL */
      responseKeys: Set<string>;
      /** Raw citation count (one per TrackingResult row) */
      totalCitations: number;
      engines: Set<string>;
      queryIds: Set<string>;
      mentionedBrands: Set<string>;
      lastSeenAt: Date;
    }

    const urlMap = new Map<string, UrlEntry>();

    for (const tr of trackingResults) {
      const sourceUrl = tr.sourceUrl;
      const domain = extractDomain(sourceUrl);
      const title =
        (tr.metadata as Record<string, unknown>)?.sourceTitle as string || "";
      const responseKey = `${tr.queryId}|${tr.fetchedAt.toISOString()}|${tr.engine}`;

      let entry = urlMap.get(sourceUrl);
      if (!entry) {
        const domainType = classifyDomain(
          domain,
          workspaceDomain,
          competitorDomains
        );
        const urlType = classifyUrlType(sourceUrl, title);

        entry = {
          url: sourceUrl,
          domain,
          domainType,
          urlType,
          title,
          responseKeys: new Set(),
          totalCitations: 0,
          engines: new Set(),
          queryIds: new Set(),
          mentionedBrands: new Set(),
          lastSeenAt: tr.fetchedAt,
        };
        urlMap.set(sourceUrl, entry);
      }

      // usedTotal = unique response sessions; totalCitations = raw row count
      entry.responseKeys.add(responseKey);
      entry.totalCitations += 1;
      entry.engines.add(tr.engine || "google_ai_overview");
      entry.queryIds.add(tr.queryId.toString());
      if (tr.fetchedAt > entry.lastSeenAt) entry.lastSeenAt = tr.fetchedAt;

      if (tr.competitorDomain) {
        entry.mentionedBrands.add(tr.competitorDomain);
      }
    }

    const enrichedUrls = Array.from(urlMap.values());

    // ── Gap Analysis: identify "gap queries" ────────────────────────
    // A gap query = a query where at least one competitor domain is cited
    // as a source but the workspace domain is NOT cited as a source.
    // Sources from gap queries represent content/citation opportunities.

    // Build per-query domain sets
    const queryDomainMap = new Map<string, Set<string>>();
    for (const tr of trackingResults) {
      const qid = tr.queryId.toString();
      if (!queryDomainMap.has(qid)) queryDomainMap.set(qid, new Set());
      const domain = extractDomain(tr.sourceUrl);
      queryDomainMap.get(qid)!.add(domain);
    }

    // Identify gap queries
    const gapQueryIds = new Set<string>();
    for (const [qid, domains] of queryDomainMap) {
      const hasBrandSource =
        workspaceDomain !== "" && domains.has(workspaceDomain);
      const hasCompetitorSource = competitorDomains.some((cd) =>
        domains.has(cd)
      );
      if (hasCompetitorSource && !hasBrandSource) {
        gapQueryIds.add(qid);
      }
    }

    // For each URL, count how many gap queries it appears in and which competitors
    const urlGapData = new Map<
      string,
      { gapQueryCount: number; competitorsInGap: Set<string> }
    >();
    for (const entry of enrichedUrls) {
      let gapQueryCount = 0;
      const competitorsInGap = new Set<string>();
      for (const qid of entry.queryIds) {
        if (gapQueryIds.has(qid)) {
          gapQueryCount++;
          // Which competitors appear in this gap query?
          const domains = queryDomainMap.get(qid);
          if (domains) {
            for (const cd of competitorDomains) {
              if (domains.has(cd)) competitorsInGap.add(cd);
            }
          }
        }
      }
      urlGapData.set(entry.url, { gapQueryCount, competitorsInGap });
    }

    // ── Route to the appropriate view handler ───────────────────────

    if (view === "urls") {
      return handleUrlsView({
        enrichedUrls,
        totalResponses,
        urlTypeFilter,
        gapAnalysis,
        searchText,
        page,
        limit,
        workspaceDomain,
        competitorDomains,
        days,
        trackingResults,
        tenantObjId,
        sinceDate,
        urlGapData,
        gapQueryIds,
      });
    }

    return handleDomainsView({
      enrichedUrls,
      totalResponses,
      domainTypeFilter,
      gapAnalysis,
      searchText,
      page,
      limit,
      workspaceDomain,
      competitorDomains,
      days,
      trackingResults,
      tenantObjId,
      sinceDate,
      urlGapData,
      gapQueryIds,
    });
  } catch (error) {
    console.error("Sources API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── Shared types ───────────────────────────────────────────────────────

interface UrlEntry {
  url: string;
  domain: string;
  domainType: string;
  urlType: string;
  title: string;
  responseKeys: Set<string>;
  totalCitations: number;
  engines: Set<string>;
  queryIds: Set<string>;
  mentionedBrands: Set<string>;
  lastSeenAt: Date;
}

interface ViewParams {
  enrichedUrls: UrlEntry[];
  totalResponses: number;
  domainTypeFilter?: string[];
  urlTypeFilter?: string[];
  gapAnalysis: boolean;
  searchText: string;
  page: number;
  limit: number;
  workspaceDomain: string;
  competitorDomains: string[];
  days: number;
  trackingResults: unknown[];
  tenantObjId: mongoose.Types.ObjectId;
  sinceDate: Date;
  urlGapData: Map<string, { gapQueryCount: number; competitorsInGap: Set<string> }>;
  gapQueryIds: Set<string>;
}

// ─── Domains View ───────────────────────────────────────────────────────

async function handleDomainsView(params: ViewParams) {
  const {
    enrichedUrls,
    totalResponses,
    domainTypeFilter,
    gapAnalysis,
    searchText,
    page,
    limit,
    workspaceDomain,
    competitorDomains,
    days,
    tenantObjId,
    sinceDate,
    urlGapData,
    gapQueryIds,
  } = params;

  // Group URLs by domain
  interface DomainGroup {
    domain: string;
    domainType: string;
    totalUrls: number;
    /** Unique response sessions (queryId+fetchedAt+engine) that had any URL from this domain */
    responseKeys: Set<string>;
    totalCitations: number;
    engines: Set<string>;
    queryIds: Set<string>;
    mentionedBrands: Set<string>;
    lastSeenAt: Date;
  }

  const domainMap = new Map<string, DomainGroup>();

  for (const u of enrichedUrls) {
    let group = domainMap.get(u.domain);
    if (!group) {
      group = {
        domain: u.domain,
        domainType: u.domainType,
        totalUrls: 0,
        responseKeys: new Set(),
        totalCitations: 0,
        engines: new Set(),
        queryIds: new Set(),
        mentionedBrands: new Set(),
        lastSeenAt: u.lastSeenAt,
      };
      domainMap.set(u.domain, group);
    }
    group.totalUrls += 1;
    group.totalCitations += u.totalCitations;
    for (const k of u.responseKeys) group.responseKeys.add(k);
    for (const e of u.engines) group.engines.add(e);
    for (const q of u.queryIds) group.queryIds.add(q);
    for (const b of u.mentionedBrands) group.mentionedBrands.add(b);
    if (u.lastSeenAt > group.lastSeenAt) group.lastSeenAt = u.lastSeenAt;
  }

  let domains = Array.from(domainMap.values())
    .map((d) => {
      const allEngines = Array.from(d.engines);
      // usedTotal = unique response sessions that had any URL from this domain
      const usedTotal = d.responseKeys.size;

      const usedPercent =
        totalResponses > 0
          ? Math.round((usedTotal / totalResponses) * 1000) / 10
          : 0;
      // avgCitations = how many of this domain's URLs appear per response on average
      const avgCitations =
        usedTotal > 0
          ? Math.round((d.totalCitations / usedTotal) * 100) / 100
          : 0;

      let displayType = d.domainType;
      if (workspaceDomain && d.domain === workspaceDomain) {
        displayType = "you";
      }

      // Gap analysis: aggregate gap data across all URLs for this domain
      // A domain's gap queries = union of gap queries from its URLs
      const domainGapQueries = new Set<string>();
      const domainGapCompetitors = new Set<string>();
      for (const u of enrichedUrls) {
        if (u.domain !== d.domain) continue;
        const gd = urlGapData.get(u.url);
        if (gd) {
          for (const qid of u.queryIds) {
            if (gapQueryIds.has(qid)) domainGapQueries.add(qid);
          }
          for (const c of gd.competitorsInGap) domainGapCompetitors.add(c);
        }
      }

      const gapQueryCount = domainGapQueries.size;
      // gapScore = number of gap queries × (1 + number of competitors present)
      const gapScore =
        gapQueryCount > 0
          ? gapQueryCount * (1 + domainGapCompetitors.size)
          : 0;

      return {
        domain: d.domain,
        domainType: displayType,
        totalUrls: d.totalUrls,
        usedPercent,
        avgCitations,
        usedTotal,
        totalCitations: d.totalCitations,
        engines: allEngines,
        lastSeenAt: d.lastSeenAt,
        queryCount: d.queryIds.size,
        gapScore,
        gapQueryCount,
        gapCompetitors: Array.from(domainGapCompetitors),
      };
    })
    .sort((a, b) => b.usedTotal - a.usedTotal);

  // Apply filters
  if (domainTypeFilter && domainTypeFilter.length > 0) {
    domains = domains.filter((d) => domainTypeFilter.includes(d.domainType));
  }
  if (searchText) {
    const lc = searchText.toLowerCase();
    domains = domains.filter((d) => d.domain.toLowerCase().includes(lc));
  }
  if (gapAnalysis) {
    domains = domains.filter((d) => d.gapScore > 0);
    domains.sort((a, b) => b.gapScore - a.gapScore);
  }

  const totalItems = domains.length;
  const paged = domains.slice((page - 1) * limit, page * limit);

  // Type distribution for donut chart
  const typeDistribution: Record<string, number> = {};
  for (const d of domains) {
    typeDistribution[d.domainType] =
      (typeDistribution[d.domainType] || 0) + d.totalCitations;
  }

  // Top-5 domain usage trend from TrackingResult
  const top5 = domains.slice(0, 5).map((d) => d.domain);
  const trendAgg = await TrackingResult.aggregate([
    {
      $match: {
        tenantId: tenantObjId,
        fetchedAt: { $gte: sinceDate },
        sourceUrl: { $exists: true, $ne: "" },
      },
    },
    {
      $addFields: {
        _domain: {
          $toLower: {
            $replaceOne: {
              input: {
                $arrayElemAt: [
                  {
                    $split: [
                      {
                        $arrayElemAt: [
                          { $split: ["$sourceUrl", "://"] },
                          1,
                        ],
                      },
                      "/",
                    ],
                  },
                  0,
                ],
              },
              find: "www.",
              replacement: "",
            },
          },
        },
      },
    },
    { $match: { _domain: { $in: top5 } } },
    {
      $group: {
        _id: {
          date: {
            $dateToString: { format: "%Y-%m-%d", date: "$fetchedAt" },
          },
          domain: "$_domain",
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.date": 1 } },
  ]);

  const trendMap = new Map<string, Record<string, unknown>>();
  for (const t of trendAgg) {
    const date = t._id.date as string;
    if (!trendMap.has(date)) trendMap.set(date, { date });
    trendMap.get(date)![t._id.domain as string] = t.count;
  }

  const allDomainsBeforeFilter = Array.from(domainMap.values());

  return NextResponse.json({
    view: "domains",
    days,
    summary: {
      totalDomains: allDomainsBeforeFilter.length,
      totalSources: enrichedUrls.length,
      totalCitations: enrichedUrls.reduce((s, u) => s + u.totalCitations, 0),
      totalResponses,
      totalGapQueries: gapQueryIds.size,
    },
    domains: paged,
    typeDistribution,
    trend: Array.from(trendMap.values()),
    top5Domains: top5,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  });
}

// ─── URLs View ──────────────────────────────────────────────────────────

async function handleUrlsView(params: ViewParams) {
  const {
    enrichedUrls,
    totalResponses,
    urlTypeFilter,
    gapAnalysis,
    searchText,
    page,
    limit,
    workspaceDomain,
    competitorDomains,
    days,
    tenantObjId,
    sinceDate,
    urlGapData,
    gapQueryIds,
  } = params;

  let urls = enrichedUrls
    .map((s) => {
      // usedTotal = unique response sessions; totalCitations = raw row count
      const usedTotal = s.responseKeys.size;
      const avgCitations =
        usedTotal > 0
          ? Math.round((s.totalCitations / usedTotal) * 100) / 100
          : 0;

      // Gap analysis: how many gap queries include this URL
      const gd = urlGapData.get(s.url);
      const gapQueryCount = gd?.gapQueryCount || 0;
      const gapCompetitors = gd ? Array.from(gd.competitorsInGap) : [];
      const gapScore =
        gapQueryCount > 0
          ? gapQueryCount * (1 + gapCompetitors.length)
          : 0;

      return {
        id: s.url,
        url: s.url,
        domain: s.domain,
        title: s.title,
        urlType: s.urlType,
        domainType: s.domainType,
        usedTotal,
        avgCitations,
        totalCitations: s.totalCitations,
        engines: Array.from(s.engines),
        lastSeenAt: s.lastSeenAt,
        lastFetchedAt: null as Date | null,
        gapScore,
        gapQueryCount,
        gapCompetitors,
      };
    })
    .sort((a, b) => b.usedTotal - a.usedTotal);

  // Apply filters
  if (urlTypeFilter && urlTypeFilter.length > 0) {
    urls = urls.filter((u) => urlTypeFilter.includes(u.urlType));
  }
  if (searchText) {
    const lc = searchText.toLowerCase();
    urls = urls.filter(
      (u) =>
        u.url.toLowerCase().includes(lc) || u.title.toLowerCase().includes(lc)
    );
  }
  if (gapAnalysis) {
    urls = urls.filter((u) => u.gapScore > 0);
    urls.sort((a, b) => b.gapScore - a.gapScore);
  }

  const totalItems = urls.length;
  const paged = urls.slice((page - 1) * limit, page * limit);

  // URL type distribution
  const typeDistribution: Record<string, number> = {};
  for (const u of urls) {
    typeDistribution[u.urlType] =
      (typeDistribution[u.urlType] || 0) + u.totalCitations;
  }

  // Top 5 URL trend
  const top5 = urls.slice(0, 5);
  const top5Urls = top5.map((u) => u.url);
  const top5Labels = top5.map((u) => {
    try {
      const p = new URL(u.url);
      return (p.hostname + p.pathname).substring(0, 40);
    } catch {
      return u.url.substring(0, 40);
    }
  });

  const trendAgg = await TrackingResult.aggregate([
    {
      $match: {
        tenantId: tenantObjId,
        fetchedAt: { $gte: sinceDate },
        sourceUrl: { $in: top5Urls },
      },
    },
    {
      $group: {
        _id: {
          date: {
            $dateToString: { format: "%Y-%m-%d", date: "$fetchedAt" },
          },
          url: "$sourceUrl",
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.date": 1 } },
  ]);

  const trendMap = new Map<string, Record<string, unknown>>();
  for (const t of trendAgg) {
    const date = t._id.date as string;
    if (!trendMap.has(date)) trendMap.set(date, { date });
    const idx = top5Urls.indexOf(t._id.url as string);
    const label =
      idx >= 0
        ? top5Labels[idx]
        : (t._id.url as string).substring(0, 40);
    trendMap.get(date)![label] = t.count;
  }

  return NextResponse.json({
    view: "urls",
    days,
    summary: {
      totalUrls: enrichedUrls.length,
      totalSources: enrichedUrls.length,
      totalDomains: new Set(enrichedUrls.map((u) => u.domain)).size,
      totalCitations: enrichedUrls.reduce((s, u) => s + u.totalCitations, 0),
      totalResponses,
      totalGapQueries: gapQueryIds.size,
    },
    urls: paged,
    typeDistribution,
    trend: Array.from(trendMap.values()),
    top5Labels,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  });
}
