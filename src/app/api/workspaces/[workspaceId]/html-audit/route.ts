import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";

export const runtime = "nodejs";

interface AuditIssue {
  id: string;
  severity: "error" | "warning" | "info";
  category: "heading" | "semantic" | "accessibility" | "schema" | "meta" | "geo";
  element: string;
  message: string;
  suggestion: string;
  line?: number;
}

/**
 * POST /api/workspaces/[workspaceId]/html-audit
 *
 * Semantic HTML Audit — analyzes page HTML for semantic structure issues,
 * heading hierarchy, ARIA landmarks, schema alignment, and generates fixes.
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
    const { url } = body as { url: string };

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    let html = "";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Citatra-Bot/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      html = await res.text();
    } catch {
      return NextResponse.json({ error: "Failed to fetch URL" }, { status: 400 });
    }

    const issues: AuditIssue[] = [];
    let issueIdx = 0;

    // 1. Check heading hierarchy
    const headingPattern = /<(h[1-6])[^>]*>/gi;
    const headings: { level: number; line: number }[] = [];
    let match;
    while ((match = headingPattern.exec(html)) !== null) {
      const level = parseInt(match[1].charAt(1));
      const line = html.substring(0, match.index).split("\n").length;
      headings.push({ level, line });
    }

    // Missing H1
    const h1Count = headings.filter((h) => h.level === 1).length;
    if (h1Count === 0) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "error",
        category: "heading",
        element: "h1",
        message: "No H1 heading found on the page.",
        suggestion: "Add a single <h1> element as the main page title.",
      });
    } else if (h1Count > 1) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "warning",
        category: "heading",
        element: "h1",
        message: `Multiple H1 headings found (${h1Count}).`,
        suggestion: "Use a single <h1> for the main title. Convert extras to <h2>.",
      });
    }

    // Heading hierarchy skips
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1].level;
      const curr = headings[i].level;
      if (curr > prev + 1) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: "warning",
          category: "heading",
          element: `h${curr}`,
          message: `Heading hierarchy jumps from H${prev} to H${curr} (skips H${prev + 1}).`,
          suggestion: `Change <h${curr}> to <h${prev + 1}>, or add intermediate headings.`,
          line: headings[i].line,
        });
      }
    }

    // 2. Semantic elements check
    const htmlLower = html.toLowerCase();
    const semanticElements = [
      { tag: "<main", name: "main", required: true },
      { tag: "<nav", name: "nav", required: true },
      { tag: "<header", name: "header", required: false },
      { tag: "<footer", name: "footer", required: false },
      { tag: "<article", name: "article", required: false },
      { tag: "<section", name: "section", required: false },
    ];

    for (const el of semanticElements) {
      if (!htmlLower.includes(el.tag)) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: el.required ? "error" : "info",
          category: "semantic",
          element: el.name,
          message: `Missing <${el.name}> element.`,
          suggestion: el.required
            ? `Add a <${el.name}> element to define the ${el.name} region of your page.`
            : `Consider using <${el.name}> for better semantic structure.`,
        });
      }
    }

    // 3. Images without alt text
    const imgPattern = /<img(?![^>]*alt=)[^>]*>/gi;
    const imgsNoAlt = html.match(imgPattern) || [];
    if (imgsNoAlt.length > 0) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "error",
        category: "accessibility",
        element: "img",
        message: `${imgsNoAlt.length} image(s) missing alt attribute.`,
        suggestion: "Add descriptive alt text to all images for accessibility and SEO.",
      });
    }

    // 4. Meta tags
    if (!htmlLower.includes('name="description"') && !htmlLower.includes("name='description'")) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "warning",
        category: "meta",
        element: "meta description",
        message: "Missing meta description tag.",
        suggestion: 'Add <meta name="description" content="..."> for better SEO.',
      });
    }

    if (!htmlLower.includes('property="og:title"') && !htmlLower.includes("property='og:title'")) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "info",
        category: "meta",
        element: "og:title",
        message: "Missing Open Graph title meta tag.",
        suggestion: 'Add <meta property="og:title" content="..."> for social sharing.',
      });
    }

    if (!htmlLower.includes("canonical")) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "warning",
        category: "meta",
        element: "canonical",
        message: "No canonical link found.",
        suggestion: 'Add <link rel="canonical" href="..."> to prevent duplicate content issues.',
      });
    }

    // 5. Schema markup check
    if (!htmlLower.includes("application/ld+json") && !htmlLower.includes("itemtype")) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "warning",
        category: "schema",
        element: "structured data",
        message: "No structured data (JSON-LD or Microdata) found on the page.",
        suggestion:
          "Add JSON-LD schema markup to improve rich snippet eligibility. Use the Schema Generator tool to create it.",
      });
    }

    // 6. ARIA landmarks
    if (!htmlLower.includes('role="') && !htmlLower.includes("aria-")) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "info",
        category: "accessibility",
        element: "ARIA",
        message: "No ARIA roles or attributes found.",
        suggestion: "Add ARIA landmarks (role, aria-label) for improved accessibility.",
      });
    }

    // 7. Inline styles check
    const inlineStyles = (html.match(/style="/gi) || []).length;
    if (inlineStyles > 10) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "info",
        category: "semantic",
        element: "style",
        message: `${inlineStyles} inline style attributes found.`,
        suggestion: "Move styles to CSS classes for better maintainability and performance.",
      });
    }

    // 8. lang attribute on <html>
    const htmlTagMatch = html.match(/<html[^>]*>/i);
    const htmlTag = htmlTagMatch?.[0] || "";
    const langAttrMatch = htmlTag.match(/lang=["']([^"']+)["']/i);
    if (!langAttrMatch) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "error",
        category: "geo",
        element: "html lang",
        message: "Missing lang attribute on <html> element.",
        suggestion:
          'Add lang="en" (or the appropriate language) to the <html> tag for accessibility and SEO.',
      });
    }

    // 9. hreflang / rel="alternate" tags
    const hreflangPattern = /<link[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*>/gi;
    const hreflangs: { lang: string; href: string }[] = [];
    let hrefMatch;
    while ((hrefMatch = hreflangPattern.exec(html)) !== null) {
      const lang = hrefMatch[1];
      const hrefAttr = hrefMatch[0].match(/href=["']([^"']+)["']/i);
      hreflangs.push({ lang, href: hrefAttr?.[1] || "" });
    }

    if (hreflangs.length === 0) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "warning",
        category: "geo",
        element: "hreflang",
        message: "No hreflang tags found.",
        suggestion:
          'Add <link rel="alternate" hreflang="xx" href="..."> for each language/region variant to improve international SEO.',
      });
    } else {
      // Check for x-default
      const hasXDefault = hreflangs.some((h) => h.lang === "x-default");
      if (!hasXDefault) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: "info",
          category: "geo",
          element: "hreflang x-default",
          message: `Found ${hreflangs.length} hreflang tag(s) but no x-default.`,
          suggestion:
            'Add <link rel="alternate" hreflang="x-default" href="..."> as a fallback for unmatched locales.',
        });
      }

      // Check for self-referencing hreflang
      const selfRef = hreflangs.some((h) => {
        try {
          return new URL(h.href).pathname === new URL(url).pathname;
        } catch { return false; }
      });
      if (!selfRef) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: "warning",
          category: "geo",
          element: "hreflang self-ref",
          message: "No self-referencing hreflang tag found.",
          suggestion:
            "Each page should include a hreflang tag pointing to itself for correct signal handling.",
        });
      }

      // Check for empty hrefs
      const emptyHrefs = hreflangs.filter((h) => !h.href);
      if (emptyHrefs.length > 0) {
        issues.push({
          id: `issue-${++issueIdx}`,
          severity: "error",
          category: "geo",
          element: "hreflang href",
          message: `${emptyHrefs.length} hreflang tag(s) have empty or missing href.`,
          suggestion: "Ensure every hreflang tag has a valid absolute URL in the href attribute.",
        });
      }
    }

    // 10. og:locale check
    if (!htmlLower.includes('property="og:locale"') && !htmlLower.includes("property='og:locale'")) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "info",
        category: "geo",
        element: "og:locale",
        message: "Missing og:locale meta tag.",
        suggestion:
          'Add <meta property="og:locale" content="en_US"> for locale-specific social sharing.',
      });
    }

    // 11. content-language meta / header check
    if (
      !htmlLower.includes('http-equiv="content-language"') &&
      !htmlLower.includes("http-equiv='content-language'")
    ) {
      issues.push({
        id: `issue-${++issueIdx}`,
        severity: "info",
        category: "geo",
        element: "content-language",
        message: "No content-language meta tag found.",
        suggestion:
          'While the HTML lang attribute is preferred, adding <meta http-equiv="content-language" content="en"> provides an additional locale signal.',
      });
    }

    // Score
    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    const infos = issues.filter((i) => i.severity === "info").length;
    const score = Math.max(0, 100 - errors * 15 - warnings * 5 - infos * 1);

    return NextResponse.json({
      url,
      score,
      issues: issues.sort((a, b) => {
        const order = { error: 0, warning: 1, info: 2 };
        return order[a.severity] - order[b.severity];
      }),
      summary: {
        errors,
        warnings,
        infos,
        totalIssues: issues.length,
        headingsFound: headings.length,
        hreflangCount: hreflangs.length,
        htmlLang: langAttrMatch?.[1] || null,
      },
    });
  } catch (error) {
    console.error("HTML audit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
