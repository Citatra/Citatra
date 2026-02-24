import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Workspace from "@/models/Workspace";
import Competitor from "@/models/Competitor";
import dns from "dns/promises";

export const runtime = "nodejs";
export const maxDuration = 60; // allow up to 60 s for multi-region fetches

// ── Types ──────────────────────────────────────────────────────────────

interface HreflangTag {
  lang: string;
  href: string;
}

interface SchemaBlock {
  type: string;
  hasAddress: boolean;
  hasGeo: boolean;
  hasPhone: boolean;
  hasOpeningHours: boolean;
  raw: Record<string, unknown>;
}

interface GeoIssue {
  id: string;
  severity: "error" | "warning" | "info";
  category:
    | "hreflang"
    | "schema"
    | "server"
    | "meta"
    | "serp";
  message: string;
  suggestion: string;
}

interface RegionSerpResult {
  region: string;
  language: string;
  hasAiOverview: boolean;
  overviewLength: number;
  sourceCount: number;
  brandCited: boolean;
  competitorsCited: string[];
  topSources: { domain: string; url: string }[];
}

interface GeoAuditResult {
  url: string;
  score: number;
  server: {
    ip: string;
    hostname: string;
    geo: {
      country: string;
      region: string;
      city: string;
      lat: number;
      lon: number;
      org: string;
    } | null;
  };
  htmlLang: string | null;
  hreflangs: HreflangTag[];
  localSchemas: SchemaBlock[];
  ogLocale: string | null;
  serpResults: RegionSerpResult[];
  issues: GeoIssue[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    hreflangCount: number;
    localSchemaCount: number;
    regionsChecked: number;
  };
}

// ── Handler ────────────────────────────────────────────────────────────

/**
 * POST /api/workspaces/[workspaceId]/geo-audit
 *
 * Consolidated Geo Audit — checks:
 *  1. Server-IP geolocation
 *  2. HTML lang attribute
 *  3. hreflang tags (presence, x-default, self-reference, validity)
 *  4. og:locale meta
 *  5. LocalBusiness / local schema detection
 *  6. Multi-region SERP/AI-overview comparison (citations, brand presence)
 *
 * Body: { url: string, regions?: string[] }
 *   regions defaults to ["us", "gb", "de"] — max 5
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
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { url, regions: rawRegions } = body as {
      url: string;
      regions?: string[];
    };

    if (!url) {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    const regions = (rawRegions || ["us", "gb", "de"]).slice(0, 5);

    // Load workspace + competitors for brand/competitor detection
    const workspace = await Workspace.findById(workspaceId).lean();
    const competitors = await Competitor.find({
      tenantId: workspaceId,
    }).lean();
    const workspaceDomain = (workspace?.domain || "")
      .replace(/^www\./, "")
      .toLowerCase();
    const competitorDomains = competitors.map((c) =>
      c.domain.replace(/^www\./, "").toLowerCase()
    );

    const issues: GeoIssue[] = [];
    let issueIdx = 0;

    // ── 1. Fetch HTML ──────────────────────────────────────────────

    let html = "";
    let fetchedHostname = "";
    try {
      const parsed = new URL(url);
      fetchedHostname = parsed.hostname;
      const res = await fetch(url, {
        headers: { "User-Agent": "Citatra-GeoAudit/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      html = await res.text();
    } catch {
      return NextResponse.json(
        { error: "Failed to fetch URL" },
        { status: 400 }
      );
    }

    const htmlLower = html.toLowerCase();

    // ── 2. Server IP + geo lookup ──────────────────────────────────

    let serverIp = "";
    let geoData: GeoAuditResult["server"]["geo"] = null;

    try {
      const addresses = await dns.resolve4(fetchedHostname);
      serverIp = addresses[0] || "";
    } catch {
      serverIp = "";
    }

    if (serverIp) {
      try {
        // ip-api.com free tier — 45 req/min, no key needed
        const geoRes = await fetch(
          `http://ip-api.com/json/${serverIp}?fields=status,country,regionName,city,lat,lon,org`,
          { signal: AbortSignal.timeout(5000) }
        );
        const geoJson = await geoRes.json();
        if (geoJson.status === "success") {
          geoData = {
            country: geoJson.country || "",
            region: geoJson.regionName || "",
            city: geoJson.city || "",
            lat: geoJson.lat || 0,
            lon: geoJson.lon || 0,
            org: geoJson.org || "",
          };
        }
      } catch {
        // Non-blocking — geo lookup is best-effort
      }
    }

    if (!serverIp) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "warning",
        category: "server",
        message: "Could not resolve server IP address.",
        suggestion:
          "Verify the domain's DNS A record. IP geolocation helps search engines determine server location.",
      });
    }

    // ── 3. HTML lang attribute ─────────────────────────────────────

    const htmlTagMatch = html.match(/<html[^>]*>/i);
    const htmlTag = htmlTagMatch?.[0] || "";
    const langAttrMatch = htmlTag.match(/lang=["']([^"']+)["']/i);
    const htmlLang = langAttrMatch?.[1] || null;

    if (!htmlLang) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "error",
        category: "meta",
        message: "Missing lang attribute on <html> element.",
        suggestion:
          'Add lang="en" (or appropriate language) to <html> for accessibility and GEO SEO signals.',
      });
    }

    // ── 4. hreflang tags ───────────────────────────────────────────

    const hreflangPattern =
      /<link[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*>/gi;
    const hreflangs: HreflangTag[] = [];
    let hMatch;
    while ((hMatch = hreflangPattern.exec(html)) !== null) {
      const lang = hMatch[1];
      const hrefAttr = hMatch[0].match(/href=["']([^"']+)["']/i);
      hreflangs.push({ lang, href: hrefAttr?.[1] || "" });
    }

    if (hreflangs.length === 0) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "warning",
        category: "hreflang",
        message: "No hreflang tags found.",
        suggestion:
          'Add <link rel="alternate" hreflang="xx" href="..."> for each locale to improve GEO visibility.',
      });
    } else {
      if (!hreflangs.some((h) => h.lang === "x-default")) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: "info",
          category: "hreflang",
          message: `${hreflangs.length} hreflang tag(s) but no x-default fallback.`,
          suggestion:
            'Add hreflang="x-default" as a catch-all for unmatched locales.',
        });
      }

      const selfRef = hreflangs.some((h) => {
        try {
          return new URL(h.href).pathname === new URL(url).pathname;
        } catch {
          return false;
        }
      });
      if (!selfRef) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: "warning",
          category: "hreflang",
          message: "No self-referencing hreflang tag.",
          suggestion:
            "Add a hreflang tag pointing to this page itself for correct canonical signaling.",
        });
      }

      const emptyHrefs = hreflangs.filter((h) => !h.href);
      if (emptyHrefs.length > 0) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: "error",
          category: "hreflang",
          message: `${emptyHrefs.length} hreflang tag(s) with empty href.`,
          suggestion:
            "Every hreflang tag must have a valid absolute URL.",
        });
      }

      // Check for duplicate hreflang codes
      const seen = new Set<string>();
      for (const h of hreflangs) {
        if (seen.has(h.lang)) {
          issues.push({
            id: `issue-${++issueIdx}`,
            severity: "warning",
            category: "hreflang",
            message: `Duplicate hreflang code "${h.lang}".`,
            suggestion:
              "Each language-region code should appear only once.",
          });
          break;
        }
        seen.add(h.lang);
      }
    }

    // ── 5. og:locale ───────────────────────────────────────────────

    const ogLocaleMatch = html.match(
      /<meta[^>]*property=["']og:locale["'][^>]*content=["']([^"']+)["']/i
    );
    const ogLocale = ogLocaleMatch?.[1] || null;

    if (!ogLocale) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "info",
        category: "meta",
        message: "Missing og:locale meta tag.",
        suggestion:
          'Add <meta property="og:locale" content="en_US"> for locale-aware social sharing.',
      });
    }

    // ── 6. Local schema detection (LocalBusiness, etc.) ────────────

    const localSchemas: SchemaBlock[] = [];
    const ldJsonPattern =
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldJsonPattern.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(ldMatch[1]);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          const schemaType = (item["@type"] || "").toLowerCase();
          if (
            schemaType.includes("localbusiness") ||
            schemaType.includes("restaurant") ||
            schemaType.includes("store") ||
            schemaType.includes("place") ||
            schemaType.includes("organization")
          ) {
            localSchemas.push({
              type: item["@type"],
              hasAddress: !!item.address,
              hasGeo: !!item.geo,
              hasPhone: !!item.telephone,
              hasOpeningHours: !!item.openingHours || !!item.openingHoursSpecification,
              raw: item,
            });
          }
        }
      } catch {
        // Invalid JSON-LD — skip
      }
    }

    if (localSchemas.length === 0) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "info",
        category: "schema",
        message: "No LocalBusiness / Organization / Place schema found.",
        suggestion:
          "If this is a local business, add LocalBusiness JSON-LD for Maps and knowledge-panel eligibility.",
      });
    } else {
      for (const schema of localSchemas) {
        if (!schema.hasAddress) {
          issues.push({
            id: `issue-${++issueIdx}`,
            severity: "warning",
            category: "schema",
            message: `${schema.type} schema is missing address.`,
            suggestion: "Add a PostalAddress to your schema for local SEO.",
          });
        }
        if (!schema.hasGeo) {
          issues.push({
            id: `issue-${++issueIdx}`,
            severity: "info",
            category: "schema",
            message: `${schema.type} schema is missing geo coordinates.`,
            suggestion:
              "Add GeoCoordinates (lat/lon) under the geo property.",
          });
        }
        if (!schema.hasPhone) {
          issues.push({
            id: `issue-${++issueIdx}`,
            severity: "info",
            category: "schema",
            message: `${schema.type} schema is missing telephone.`,
            suggestion: "Add a telephone property for click-to-call.",
          });
        }
      }
    }

    // ── 7. Multi-region SERP / AI-overview comparison ──────────────

    // Build a search query from the page title or meta description
    const pageTitle =
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "";
    const metaDesc =
      html
        .match(
          /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
        )?.[1]
        ?.trim() || "";
    // Use first ~60 chars of title as the search query
    const serpQuery = (pageTitle || metaDesc || fetchedHostname).substring(
      0,
      60
    );

    const serpResults: RegionSerpResult[] = [];
    const apiKey = process.env.BRIGHTDATA_API_KEY;
    const zone = process.env.BRIGHTDATA_ZONE || "citatra_serp";

    if (apiKey && serpQuery) {
      const regionLanguageMap: Record<string, string> = {
        us: "en", gb: "en", ca: "en", au: "en",
        de: "de", fr: "fr", es: "es", it: "it", nl: "nl",
        br: "pt", jp: "ja", kr: "ko", in: "en", mx: "es", za: "en",
      };

      const serpFetches = regions.map(async (region): Promise<RegionSerpResult | null> => {
        const hl = regionLanguageMap[region] || "en";
        try {
          const params = new URLSearchParams({
            q: serpQuery,
            gl: region,
            hl,
            brd_json: "1",
            brd_ai_overview: "2",
          });
          const googleUrl = `https://www.google.com/search?${params.toString()}`;
          const res = await fetch("https://api.brightdata.com/request", {
            method: "POST",
            cache: "no-store",
            signal: AbortSignal.timeout(45000),
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ zone, url: googleUrl, format: "raw" }),
          });
          if (!res.ok) return null;

          const data = await res.json();
          const aio = data.ai_overview as
            | {
                texts?: Array<{
                  type?: string;
                  snippet?: string;
                  list?: Array<{ type?: string; snippet?: string; list?: Array<{ snippet?: string }> }>;
                }>;
                references?: Array<{ href?: string; title?: string; source?: string; index?: number }>;
              }
            | undefined;

          const hasAio =
            !!aio &&
            Array.isArray(aio.texts) &&
            aio.texts.length > 0;

          // ── Sources: ONLY from ai_overview.references ──
          const sources: { domain: string; url: string }[] = [];
          if (hasAio && Array.isArray(aio?.references)) {
            for (const ref of aio.references) {
              const link = ref.href || "";
              if (!link) continue;
              try {
                const d = new URL(link).hostname.replace(/^www\./, "").toLowerCase();
                sources.push({ domain: d, url: link });
              } catch { /* skip malformed */ }
            }
          }

          // ── Overview text: ONLY from ai_overview.texts ──
          let overviewText = "";
          if (hasAio && aio?.texts) {
            const extractBlock = (
              tb: { type?: string; snippet?: string; list?: Array<{ type?: string; snippet?: string; list?: Array<{ snippet?: string }> }> },
            ): string => {
              const kind = (tb.type ?? "paragraph").toLowerCase();
              if (kind === "list" && Array.isArray(tb.list)) {
                return tb.list.map((item) => extractBlock(item)).filter(Boolean).join(" ");
              }
              const s = (tb.snippet ?? "").trim();
              // Skip junk blocks
              if (!s || s.length < 3 || s.toLowerCase() === "view all") return "";
              return s;
            };
            overviewText = aio.texts.map((tb) => extractBlock(tb)).filter(Boolean).join(" ");
          }

          const brandCited =
            workspaceDomain !== "" &&
            sources.some((s) => s.domain === workspaceDomain);
          const competitorsCited = competitorDomains.filter((cd) =>
            sources.some((s) => s.domain === cd),
          );

          return {
            region,
            language: hl,
            hasAiOverview: hasAio,
            overviewLength: overviewText.length,
            sourceCount: sources.length,
            brandCited,
            competitorsCited,
            topSources: sources.slice(0, 10),
          } satisfies RegionSerpResult;
        } catch {
          return null;
        }
      });

      const results = await Promise.all(serpFetches);
      for (const r of results) {
        if (r) serpResults.push(r);
      }
    }

    // SERP-level issues
    if (serpResults.length > 0) {
      const noAio = serpResults.filter((r) => !r.hasAiOverview);
      if (noAio.length > 0 && noAio.length < serpResults.length) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: "info",
          category: "serp",
          message: `AI Overview absent in ${noAio.length} of ${serpResults.length} regions (${noAio.map((r) => r.region.toUpperCase()).join(", ")}).`,
          suggestion:
            "AI Overviews may not be available in all regions yet. Focus on regions where they appear.",
        });
      }

      const noBrand = serpResults.filter(
        (r) => r.hasAiOverview && !r.brandCited
      );
      if (noBrand.length > 0 && workspaceDomain) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: "warning",
          category: "serp",
          message: `Your domain (${workspaceDomain}) is NOT cited as an AI source in ${noBrand.length} region(s): ${noBrand.map((r) => r.region.toUpperCase()).join(", ")}.`,
          suggestion:
            "Optimize content for those regions to increase GEO citation probability.",
        });
      }

      const compOnlyRegions = serpResults.filter(
        (r) => r.hasAiOverview && !r.brandCited && r.competitorsCited.length > 0
      );
      if (compOnlyRegions.length > 0) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: "error",
          category: "serp",
          message: `Competitors cited but you are NOT in ${compOnlyRegions.length} region(s): ${compOnlyRegions.map((r) => `${r.region.toUpperCase()} (${r.competitorsCited.join(", ")})`).join("; ")}.`,
          suggestion:
            "These are high-priority gap regions. Localize content, add hreflang, and target these markets.",
        });
      }
    }

    // ── Score ───────────────────────────────────────────────────────

    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    const infos = issues.filter((i) => i.severity === "info").length;
    const score = Math.max(0, 100 - errors * 15 - warnings * 5 - infos * 1);

    const result: GeoAuditResult = {
      url,
      score,
      server: {
        ip: serverIp,
        hostname: fetchedHostname,
        geo: geoData,
      },
      htmlLang,
      hreflangs,
      localSchemas,
      ogLocale,
      serpResults,
      issues: issues.sort((a, b) => {
        const order = { error: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      }),
      summary: {
        errors,
        warnings,
        infos,
        hreflangCount: hreflangs.length,
        localSchemaCount: localSchemas.length,
        regionsChecked: serpResults.length,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Geo audit error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
