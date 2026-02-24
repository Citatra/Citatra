import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Workspace from "@/models/Workspace";
import PageAnalysis, { AnalysisType } from "@/models/PageAnalysis";

export const runtime = "nodejs";
// Allow longer timeout for bulk crawl+analysis
export const maxDuration = 120;

const MAX_PAGES = 15;

// ── Crawl helpers ──────────────────────────────────────────────────────────

function normalizeDomain(domain: string): string {
  if (!domain.startsWith("http://") && !domain.startsWith("https://")) {
    return `https://${domain}`;
  }
  return domain.replace(/\/$/, "");
}

function extractUrlsFromSitemap(xml: string, origin: string): string[] {
  const matches = xml.matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi);
  const urls: string[] = [];
  for (const m of matches) {
    const u = m[1].trim();
    try {
      const parsed = new URL(u);
      const base = new URL(origin);
      if (parsed.hostname === base.hostname) urls.push(u);
    } catch {
      // skip malformed
    }
  }
  return urls;
}

function extractUrlsFromHtml(html: string, origin: string): string[] {
  const seen = new Set<string>();
  const base = new URL(origin);
  const matches = html.matchAll(/href=["']([^"'#?]+)["']/gi);
  const urls: string[] = [];

  for (const m of matches) {
    let href = m[1].trim();
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;

    try {
      // Resolve relative URLs
      const resolved = new URL(href, origin);
      if (resolved.hostname !== base.hostname) continue;
      // Only include HTML pages, skip assets
      if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|pdf|zip)(\?|$)/i.test(resolved.pathname)) continue;
      const key = resolved.href.replace(/\/$/, "");
      if (!seen.has(key) && key !== origin) {
        seen.add(key);
        urls.push(key);
      }
    } catch {
      // skip
    }
  }
  return urls;
}

async function crawlDomain(domain: string): Promise<string[]> {
  const origin = normalizeDomain(domain);
  const urls: string[] = [];

  // 1. Try sitemap.xml
  try {
    const sitemapRes = await fetch(`${origin}/sitemap.xml`, {
      headers: { "User-Agent": "Citatra-Bot/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (sitemapRes.ok) {
      const xml = await sitemapRes.text();
      // Handle sitemap index (nested sitemaps)
      if (xml.includes("<sitemapindex")) {
        const nestedMatches = xml.matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi);
        for (const m of nestedMatches) {
          if (urls.length >= MAX_PAGES) break;
          try {
            const nestedRes = await fetch(m[1].trim(), {
              headers: { "User-Agent": "Citatra-Bot/1.0" },
              signal: AbortSignal.timeout(6000),
            });
            if (nestedRes.ok) {
              const nestedXml = await nestedRes.text();
              urls.push(...extractUrlsFromSitemap(nestedXml, origin));
            }
          } catch { /* skip */ }
        }
      } else {
        urls.push(...extractUrlsFromSitemap(xml, origin));
      }
    }
  } catch { /* sitemap not available */ }

  // 2. Fall back to scraping homepage links if sitemap gave us nothing
  if (urls.length < 3) {
    try {
      const homeRes = await fetch(origin, {
        headers: { "User-Agent": "Citatra-Bot/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (homeRes.ok) {
        const html = await homeRes.text();
        // Add homepage itself
        if (!urls.includes(origin)) urls.unshift(origin);
        urls.push(...extractUrlsFromHtml(html, origin));
      }
    } catch { /* homepage not reachable */ }
  }

  // Deduplicate and cap
  const seen = new Set<string>();
  const result: string[] = [];
  for (const u of urls) {
    const key = u.replace(/\/$/, "");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(u);
    }
    if (result.length >= MAX_PAGES) break;
  }
  return result;
}

// ── Summary extraction per analysis type ──────────────────────────────────

function extractSummary(analysisType: AnalysisType, result: Record<string, unknown>) {
  switch (analysisType) {
    case "html-audit": {
      const s = result.summary as Record<string, number> | undefined;
      return {
        score: typeof result.score === "number" ? result.score : undefined,
        errors: s?.errors,
        warnings: s?.warnings,
        infos: s?.infos,
        totalIssues: s?.totalIssues,
      };
    }
    case "schema-generator": {
      const schemas = Array.isArray(result.schemas) ? result.schemas : [];
      return {
        schemaCount: schemas.length,
        schemaTypes: schemas.map((s: { type?: string }) => s.type ?? "Unknown"),
      };
    }
    case "semantic-map": {
      const s = result.summary as Record<string, number> | undefined;
      return {
        entityCount: s?.totalEntities,
        topicCount: s?.topicsCovered,
        topicsMissing: s?.topicsMissing,
        pageTitle: typeof result.pageTitle === "string" ? result.pageTitle : undefined,
      };
    }
    case "geo-audit": {
      const s = result.summary as Record<string, unknown> | undefined;
      const issues = Array.isArray(result.issues) ? result.issues : [];
      return {
        score: typeof result.score === "number" ? result.score : undefined,
        totalIssues: typeof s?.totalIssues === "number" ? s.totalIssues : issues.length,
        errors: typeof s?.errors === "number" ? s.errors : undefined,
        warnings: typeof s?.warnings === "number" ? s.warnings : undefined,
      };
    }
    default:
      return {};
  }
}

// ── Route handler ──────────────────────────────────────────────────────────

/**
 * POST /api/workspaces/[workspaceId]/page-analyses/bulk-analyze
 * Body: { analysisType: "html-audit" | "schema-generator" | "semantic-map" | "geo-audit" }
 *
 * Crawls the workspace domain (sitemap → homepage links), runs analysis on
 * up to 15 URLs, saves results to PageAnalysis, and returns all results.
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
    const { analysisType } = body as { analysisType: AnalysisType };

    if (!["html-audit", "schema-generator", "semantic-map", "geo-audit"].includes(analysisType)) {
      return NextResponse.json({ error: "Invalid analysisType" }, { status: 400 });
    }

    // Get workspace domain
    const workspace = await Workspace.findById(workspaceId).lean();
    if (!workspace?.domain) {
      return NextResponse.json(
        { error: "No domain configured for this workspace. Add a domain in Settings." },
        { status: 400 }
      );
    }

    // Crawl domain for URLs
    const urls = await crawlDomain(workspace.domain);
    if (urls.length === 0) {
      return NextResponse.json(
        { error: "Could not discover any pages from the workspace domain." },
        { status: 400 }
      );
    }

    // Derive base URL for internal API calls
    const origin =
      req.headers.get("origin") ||
      req.headers.get("x-forwarded-proto")
        ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
        : process.env.NEXTAUTH_URL || "http://localhost:3000";

    const cookie = req.headers.get("cookie") || "";

    // Analyze each URL (sequential to avoid overloading the target)
    // Using unknown[] since Mongoose lean docs don't index with string keys
    const savedResults: unknown[] = [];

    for (const pageUrl of urls) {
      try {
        const apiRes = await fetch(
          `${origin}/api/workspaces/${workspaceId}/${analysisType}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: cookie,
            },
            body: JSON.stringify({ url: pageUrl }),
            signal: AbortSignal.timeout(30000),
          }
        );

        if (!apiRes.ok) {
          // Save as failed
          const doc = await PageAnalysis.findOneAndUpdate(
            { workspaceId, analysisType, url: pageUrl },
            {
              workspaceId,
              analysisType,
              url: pageUrl,
              result: {},
              summary: {},
              status: "failed",
              errorMessage: `HTTP ${apiRes.status}`,
              analyzedAt: new Date(),
            },
            { upsert: true, new: true }
          ).lean();
          savedResults.push(doc);
          continue;
        }

        const result = await apiRes.json() as Record<string, unknown>;
        const summary = extractSummary(analysisType, result);

        const doc = await PageAnalysis.findOneAndUpdate(
          { workspaceId, analysisType, url: pageUrl },
          {
            workspaceId,
            analysisType,
            url: pageUrl,
            result,
            summary,
            status: "success",
            errorMessage: undefined,
            analyzedAt: new Date(),
          },
          { upsert: true, new: true }
        ).lean();

        savedResults.push(doc);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        const doc = await PageAnalysis.findOneAndUpdate(
          { workspaceId, analysisType, url: pageUrl },
          {
            workspaceId,
            analysisType,
            url: pageUrl,
            result: {},
            summary: {},
            status: "failed",
            errorMessage: errMsg,
            analyzedAt: new Date(),
          },
          { upsert: true, new: true }
        ).lean();
        savedResults.push(doc);      }    }

    return NextResponse.json({
      analyzed: savedResults.length,
      results: savedResults,
    });
  } catch (error) {
    console.error("bulk-analyze error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
