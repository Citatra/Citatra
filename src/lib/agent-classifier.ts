/**
 * Agent Classifier — deterministic UA/IP rules + heuristics
 *
 * Classifies incoming requests as AI agent requests and identifies
 * the engine, purpose, and confidence level.
 *
 * Phase 1: deterministic User-Agent regex + known IP/ASN patterns
 * Phase 2 (future): ML model for edge-case classification
 */

import type { AgentEngine, AgentPurpose } from "@/models/AgentRequest";

/* ------------------------------------------------------------------ */
/*  Classification result                                              */
/* ------------------------------------------------------------------ */

export interface AgentClassification {
  isAgent: boolean;
  engine: AgentEngine;
  agentPurpose: AgentPurpose;
  confidence: number; // 0–1
}

/* ------------------------------------------------------------------ */
/*  UA pattern → engine mapping                                        */
/* ------------------------------------------------------------------ */

interface UARule {
  pattern: RegExp;
  engine: AgentEngine;
  purpose: AgentPurpose;
  confidence: number;
}

const UA_RULES: UARule[] = [
  // OpenAI / ChatGPT
  { pattern: /ChatGPT-User/i, engine: "chatgpt", purpose: "real-time", confidence: 0.95 },
  { pattern: /GPTBot/i, engine: "chatgpt", purpose: "index", confidence: 0.95 },
  { pattern: /OAI-SearchBot/i, engine: "chatgpt", purpose: "index", confidence: 0.90 },

  // Google / Gemini
  { pattern: /Google-Extended/i, engine: "gemini", purpose: "training", confidence: 0.90 },
  { pattern: /Googlebot.*Gemini/i, engine: "gemini", purpose: "real-time", confidence: 0.85 },
  { pattern: /Google-InspectionTool/i, engine: "gemini", purpose: "index", confidence: 0.80 },

  // Anthropic / Claude
  { pattern: /ClaudeBot/i, engine: "claude", purpose: "index", confidence: 0.95 },
  { pattern: /Claude-Web/i, engine: "claude", purpose: "real-time", confidence: 0.90 },
  { pattern: /anthropic-ai/i, engine: "claude", purpose: "training", confidence: 0.85 },

  // Perplexity
  { pattern: /PerplexityBot/i, engine: "perplexity", purpose: "real-time", confidence: 0.95 },

  // Microsoft / Bing
  { pattern: /bingbot/i, engine: "bing", purpose: "index", confidence: 0.80 },
  { pattern: /BingPreview/i, engine: "bing", purpose: "preview", confidence: 0.85 },

  // DeepSeek
  { pattern: /DeepSeekBot/i, engine: "deepseek", purpose: "index", confidence: 0.90 },
  { pattern: /Deepseek/i, engine: "deepseek", purpose: "training", confidence: 0.75 },

  // Meta
  { pattern: /Meta-ExternalAgent/i, engine: "meta", purpose: "index", confidence: 0.90 },
  { pattern: /meta-externalfetcher/i, engine: "meta", purpose: "training", confidence: 0.85 },
  { pattern: /facebookexternalhit/i, engine: "meta", purpose: "preview", confidence: 0.70 },

  // Apple
  { pattern: /Applebot-Extended/i, engine: "apple", purpose: "training", confidence: 0.90 },
  { pattern: /Applebot/i, engine: "apple", purpose: "index", confidence: 0.85 },
];

/* ------------------------------------------------------------------ */
/*  Known IP ranges (CIDR prefix match — simplified)                   */
/* ------------------------------------------------------------------ */

interface IPRule {
  prefixes: string[];
  engine: AgentEngine;
  confidence: number;
}

const IP_RULES: IPRule[] = [
  {
    prefixes: ["20.15.", "20.171.", "52.167."], // OpenAI known ranges
    engine: "chatgpt",
    confidence: 0.80,
  },
  {
    prefixes: ["66.249.", "64.233.", "66.102.", "72.14.", "209.85.", "216.239."],
    engine: "gemini",
    confidence: 0.70,
  },
  {
    prefixes: ["160.79.104."],
    engine: "perplexity",
    confidence: 0.80,
  },
];

/* ------------------------------------------------------------------ */
/*  Header-based detection                                             */
/* ------------------------------------------------------------------ */

const HEADER_ENGINE_MAP: Record<string, AgentEngine> = {
  "x-openai-agent": "chatgpt",
  "x-anthropic-agent": "claude",
  "x-perplexity-agent": "perplexity",
  "x-google-agent": "gemini",
};

/* ------------------------------------------------------------------ */
/*  Request frequency heuristic                                        */
/* ------------------------------------------------------------------ */

export interface RequestPatternFeatures {
  requestsPerMinute: number;
  avgIntervalMs: number;
  uniquePathsPerSession: number;
}

function classifyByPattern(features?: RequestPatternFeatures): {
  purpose: AgentPurpose;
  confidence: number;
} {
  if (!features) return { purpose: "unknown", confidence: 0 };

  // Rapid crawling across many paths → indexing bot
  if (features.requestsPerMinute > 30 && features.uniquePathsPerSession > 20) {
    return { purpose: "index", confidence: 0.70 };
  }

  // Single-page, real-time fetch pattern
  if (features.requestsPerMinute <= 5 && features.uniquePathsPerSession <= 3) {
    return { purpose: "real-time", confidence: 0.65 };
  }

  // Moderate rate, broad crawl → training
  if (features.requestsPerMinute > 10) {
    return { purpose: "training", confidence: 0.60 };
  }

  return { purpose: "unknown", confidence: 0.3 };
}

/* ------------------------------------------------------------------ */
/*  Main classifier                                                    */
/* ------------------------------------------------------------------ */

/**
 * Classify a request as an AI agent request.
 *
 * @param userAgent  - Full User-Agent header
 * @param ip         - Client IP address
 * @param headers    - Subset of request headers (lowercase keys)
 * @param patterns   - Optional request frequency features for heuristic refinement
 */
export function classifyAgent(
  userAgent: string,
  ip: string,
  headers: Record<string, string> = {},
  patterns?: RequestPatternFeatures
): AgentClassification {
  // 1. Check User-Agent rules (highest priority)
  for (const rule of UA_RULES) {
    if (rule.pattern.test(userAgent)) {
      // Optionally refine purpose with pattern features
      const patternResult = classifyByPattern(patterns);
      const purpose =
        patternResult.confidence > rule.confidence * 0.8
          ? patternResult.purpose
          : rule.purpose;

      return {
        isAgent: true,
        engine: rule.engine,
        agentPurpose: purpose,
        confidence: rule.confidence,
      };
    }
  }

  // 2. Check headers for engine identification
  for (const [header, engine] of Object.entries(HEADER_ENGINE_MAP)) {
    if (headers[header]) {
      return {
        isAgent: true,
        engine,
        agentPurpose: "real-time",
        confidence: 0.80,
      };
    }
  }

  // 3. Check IP ranges
  for (const ipRule of IP_RULES) {
    for (const prefix of ipRule.prefixes) {
      if (ip.startsWith(prefix)) {
        const patternResult = classifyByPattern(patterns);
        return {
          isAgent: true,
          engine: ipRule.engine,
          agentPurpose: patternResult.purpose !== "unknown" ? patternResult.purpose : "index",
          confidence: ipRule.confidence,
        };
      }
    }
  }

  // 4. Heuristic: check for common bot-like UA substrings
  const botPatterns = /bot|crawler|spider|scraper|fetcher|agent/i;
  if (botPatterns.test(userAgent)) {
    const patternResult = classifyByPattern(patterns);
    return {
      isAgent: true,
      engine: "unknown",
      agentPurpose: patternResult.purpose !== "unknown" ? patternResult.purpose : "index",
      confidence: 0.40,
    };
  }

  // Not an AI agent
  return {
    isAgent: false,
    engine: "unknown",
    agentPurpose: "unknown",
    confidence: 0,
  };
}

/* ------------------------------------------------------------------ */
/*  URL canonicalization                                                */
/* ------------------------------------------------------------------ */

/**
 * Canonicalize a URL for consistent aggregation.
 * Removes session tokens, tracking params, trailing slashes, and normalizes case.
 */
export function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);

    // Remove common tracking / session parameters
    const stripParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "msclkid",
      "mc_cid",
      "mc_eid",
      "ref",
      "source",
      "sessionid",
      "sid",
      "_ga",
    ];
    for (const p of stripParams) {
      url.searchParams.delete(p);
    }

    // Sort remaining params for canonical consistency
    url.searchParams.sort();

    // Lowercase host, remove trailing slash
    let canonical = url.origin.toLowerCase() + url.pathname.replace(/\/+$/, "");
    const qs = url.searchParams.toString();
    if (qs) canonical += "?" + qs;

    return canonical;
  } catch {
    // If URL is invalid, return lowercased original
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Extract a slug from a URL path for matching.
 */
export function extractSlug(url: string): string {
  try {
    const path = new URL(url).pathname;
    // Last meaningful path segment
    const segments = path.split("/").filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1].toLowerCase() : "";
  } catch {
    return url
      .toLowerCase()
      .replace(/^https?:\/\/[^/]+/, "")
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean)
      .pop() || "";
  }
}

/**
 * Anonymize an IP address for privacy (zero last octet for IPv4).
 */
export function anonymizeIp(ip: string): string {
  // IPv4
  const v4 = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (v4) return v4[1] + ".0";

  // IPv6 — mask last 80 bits (simplified)
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length > 4) {
      return parts.slice(0, 4).join(":") + "::";
    }
  }

  return ip;
}

/* ------------------------------------------------------------------ */
/*  Engine weights for attribution                                     */
/* ------------------------------------------------------------------ */

export interface EngineWeights {
  baseCTR: number;         // Base click-through rate for this engine
  authorityWeight: number; // How much weight to give this engine in visibility
  shareEstimate: number;   // Estimated market share of AI search (0–1)
}

/**
 * Engine-aware CTR and weight table.
 * These are starting estimates; should be tuned with real data over time.
 */
export const ENGINE_WEIGHTS: Record<string, EngineWeights> = {
  chatgpt:    { baseCTR: 0.04, authorityWeight: 1.0, shareEstimate: 0.35 },
  gemini:     { baseCTR: 0.05, authorityWeight: 0.9, shareEstimate: 0.25 },
  perplexity: { baseCTR: 0.06, authorityWeight: 0.7, shareEstimate: 0.10 },
  bing:       { baseCTR: 0.03, authorityWeight: 0.6, shareEstimate: 0.10 },
  claude:     { baseCTR: 0.03, authorityWeight: 0.8, shareEstimate: 0.08 },
  deepseek:   { baseCTR: 0.03, authorityWeight: 0.5, shareEstimate: 0.05 },
  meta:       { baseCTR: 0.02, authorityWeight: 0.4, shareEstimate: 0.04 },
  apple:      { baseCTR: 0.03, authorityWeight: 0.5, shareEstimate: 0.03 },
  unknown:    { baseCTR: 0.02, authorityWeight: 0.3, shareEstimate: 0.00 },
};

/**
 * Page-type CTR multiplier — some page types convert better from AI.
 */
export const PAGE_TYPE_CTR_MULTIPLIER: Record<string, number> = {
  article: 1.0,
  product: 1.3,
  faq: 0.8,
  homepage: 0.6,
  category: 0.7,
  landing: 1.2,
  comparison: 1.4,
  "how-to": 1.1,
  other: 0.9,
};
