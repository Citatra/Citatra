/**
 * Source classification & extraction utilities.
 *
 * Auto-classifies domains (editorial, ugc, corporate, etc.)
 * and URL types (article, listicle, comparison, etc.) for the Sources feature.
 */

import type { SourceDomainType, SourceUrlType } from "@/models/Source";

// ─── Domain Type Classification ─────────────────────────────────────────

const EDITORIAL_DOMAINS = new Set([
  "nytimes.com", "washingtonpost.com", "theguardian.com", "bbc.com", "bbc.co.uk",
  "cnn.com", "reuters.com", "bloomberg.com", "forbes.com", "fortune.com",
  "businessinsider.com", "techcrunch.com", "theverge.com", "wired.com",
  "arstechnica.com", "zdnet.com", "cnet.com", "mashable.com", "engadget.com",
  "venturebeat.com", "thenextweb.com", "huffpost.com", "vox.com", "axios.com",
  "medium.com", "substack.com", "time.com", "inc.com", "entrepreneur.com",
  "fastcompany.com", "hbr.org", "computerworld.com", "infoworld.com",
  "searchengineland.com", "searchenginejournal.com", "moz.com", "semrush.com",
  "ahrefs.com", "backlinko.com", "hubspot.com", "neilpatel.com",
  "contentmarketinginstitute.com", "marketingland.com", "adweek.com",
  "pcmag.com", "tomsguide.com", "tomshardware.com", "anandtech.com",
]);

const UGC_DOMAINS = new Set([
  "reddit.com", "quora.com", "stackexchange.com", "stackoverflow.com",
  "twitter.com", "x.com", "facebook.com", "instagram.com", "tiktok.com",
  "youtube.com", "linkedin.com", "pinterest.com", "tumblr.com",
  "producthunt.com", "hackernews.com", "news.ycombinator.com",
  "discord.com", "slack.com", "community.hubspot.com",
]);

const REFERENCE_DOMAINS = new Set([
  "wikipedia.org", "wikimedia.org", "wiktionary.org", "britannica.com",
  "merriam-webster.com", "dictionary.com", "investopedia.com",
  "docs.google.com", "support.google.com", "developer.mozilla.org",
  "w3schools.com", "tutorialspoint.com", "geeksforgeeks.org",
  "docs.microsoft.com", "learn.microsoft.com", "developer.apple.com",
  "docs.aws.amazon.com", "cloud.google.com", "docs.github.com",
]);

const INSTITUTIONAL_DOMAINS = new Set([
  "who.int", "cdc.gov", "nih.gov", "fda.gov", "epa.gov",
  "nasa.gov", "whitehouse.gov", "congress.gov", "europa.eu",
  "un.org", "worldbank.org", "imf.org",
]);

const INSTITUTIONAL_TLDS = [".gov", ".edu", ".mil", ".int"];

/**
 * Classify a domain into a SourceDomainType.
 * If competitorDomains is provided, checks against those first.
 */
export function classifyDomain(
  domain: string,
  workspaceDomain?: string,
  competitorDomains?: string[]
): SourceDomainType {
  const normalized = domain.toLowerCase().replace(/^www\./, "");

  // Check if it's the user's own domain
  if (workspaceDomain) {
    const normWs = workspaceDomain.toLowerCase().replace(/^www\./, "");
    if (normalized === normWs || normalized.endsWith(`.${normWs}`)) {
      return "corporate";
    }
  }

  // Check competitors
  if (competitorDomains) {
    for (const comp of competitorDomains) {
      const normComp = comp.toLowerCase().replace(/^www\./, "");
      if (normalized === normComp || normalized.endsWith(`.${normComp}`)) {
        return "competitor";
      }
    }
  }

  // Check known lists
  if (EDITORIAL_DOMAINS.has(normalized)) return "editorial";
  if (UGC_DOMAINS.has(normalized)) return "ugc";
  if (REFERENCE_DOMAINS.has(normalized)) return "reference";
  if (INSTITUTIONAL_DOMAINS.has(normalized)) return "institutional";

  // Check TLD patterns
  for (const tld of INSTITUTIONAL_TLDS) {
    if (normalized.endsWith(tld)) return "institutional";
  }

  // Check subdomains of known domains
  for (const d of EDITORIAL_DOMAINS) {
    if (normalized.endsWith(`.${d}`)) return "editorial";
  }
  for (const d of UGC_DOMAINS) {
    if (normalized.endsWith(`.${d}`)) return "ugc";
  }
  for (const d of REFERENCE_DOMAINS) {
    if (normalized.endsWith(`.${d}`)) return "reference";
  }

  return "other";
}

// ─── URL Type Classification ────────────────────────────────────────────

/**
 * Classify a URL into a SourceUrlType based on path patterns and title.
 */
export function classifyUrlType(
  url: string,
  title?: string
): SourceUrlType {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = (title || "").toLowerCase();
  const combined = `${lowerUrl} ${lowerTitle}`;

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();

    // Homepage
    if (path === "/" || path === "" || path === "/index.html") {
      return "homepage";
    }

    // Discussion threads
    if (
      lowerUrl.includes("reddit.com/r/") ||
      lowerUrl.includes("quora.com/") ||
      lowerUrl.includes("stackoverflow.com/questions/") ||
      lowerUrl.includes("stackexchange.com/questions/") ||
      lowerUrl.includes("forum") ||
      lowerUrl.includes("community") ||
      lowerUrl.includes("/discuss")
    ) {
      return "discussion";
    }

    // Profile / directory pages
    if (
      lowerUrl.includes("g2.com/products/") ||
      lowerUrl.includes("capterra.com/") ||
      lowerUrl.includes("trustpilot.com/review/") ||
      lowerUrl.includes("crunchbase.com/organization/") ||
      lowerUrl.includes("yelp.com/biz/") ||
      lowerUrl.includes("/profile/") ||
      lowerUrl.includes("/company/")
    ) {
      return "profile";
    }

    // Product pages
    if (
      path.includes("/product") ||
      path.includes("/pricing") ||
      path.includes("/features") ||
      lowerUrl.includes("shopify.com/") && path.includes("/products/")
    ) {
      return "product_page";
    }

    // Category pages
    if (
      path.includes("/category/") ||
      path.includes("/categories/") ||
      path.includes("/collections/") ||
      path.includes("/tag/") ||
      path.includes("/topics/")
    ) {
      return "category_page";
    }

    // Alternatives pages
    if (
      combined.includes("alternative") ||
      combined.includes("competitors to") ||
      combined.includes("instead of") ||
      combined.includes("replacement for")
    ) {
      return "alternative";
    }

    // Comparison pages
    if (
      combined.includes(" vs ") ||
      combined.includes(" versus ") ||
      combined.includes("comparison") ||
      combined.includes("compared to") ||
      combined.includes("compare")
    ) {
      return "comparison";
    }

    // Listicles
    if (
      /\b(top|best|\d+)\s+(tools|software|apps|platforms|services|ways|tips|options|picks|choices)/i.test(combined) ||
      /\b\d+\s+best\b/i.test(combined) ||
      combined.includes("listicle")
    ) {
      return "listicle";
    }

    // How-to guides
    if (
      combined.includes("how to") ||
      combined.includes("how-to") ||
      combined.includes("step-by-step") ||
      combined.includes("tutorial") ||
      combined.includes("guide to") ||
      path.includes("/guide/") ||
      path.includes("/tutorial/")
    ) {
      return "how_to_guide";
    }

    // Articles (blog posts, news)
    if (
      path.includes("/blog/") ||
      path.includes("/article/") ||
      path.includes("/news/") ||
      path.includes("/post/") ||
      path.includes("/learn/") ||
      path.includes("/resources/")
    ) {
      return "article";
    }
  } catch {
    // Invalid URL, fall through
  }

  // Default
  return "article";
}

// ─── Domain extraction ──────────────────────────────────────────────────

/**
 * Extract root domain from a URL string.
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    // Fallback: try to extract domain from malformed URL
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s:]+)/);
    return match ? match[1].toLowerCase() : url.toLowerCase();
  }
}

/**
 * Domain type labels for display.
 */
export const DOMAIN_TYPE_LABELS: Record<SourceDomainType, string> = {
  corporate: "Corporate",
  editorial: "Editorial",
  institutional: "Institutional",
  ugc: "UGC",
  reference: "Reference",
  competitor: "Competitor",
  other: "Other",
};

/**
 * URL type labels for display.
 */
export const URL_TYPE_LABELS: Record<SourceUrlType, string> = {
  homepage: "Homepage",
  category_page: "Category Page",
  product_page: "Product Page",
  listicle: "Listicle",
  comparison: "Comparison",
  profile: "Profile",
  alternative: "Alternative",
  discussion: "Discussion",
  how_to_guide: "How-to Guide",
  article: "Article",
  other: "Other",
};
