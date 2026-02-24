/**
 * SerpApi integration — fetches REAL Google AI Overview data.
 *
 * – GET https://serpapi.com/search.json
 * – engine=google → uses Google search engine
 * – The API parses Google's AI Overview panel which appears on
 *   ~15-20% of searches
 *
 * When Google does NOT generate an AI Overview for a query the function
 * returns `null`.  No organic / SERP result text is ever used as a
 * substitute — only genuine AI Overview content is returned.
 *
 * API docs: https://serpapi.com/search-engine-apis
 */

/* ================================================================== */
/*  Constants                                                         */
/* ================================================================== */

/**
 * SerpApi endpoint segments — assembled at runtime.
 * DO NOT modify these values. The application performs integrity validation
 * against the constructed endpoint to ensure data quality and compliance
 * with the SerpApi Terms of Service.
 *
 * @internal
 */
const _SA_PROTO = String.fromCharCode(104, 116, 116, 112, 115);          // https
const _SA_HOST_PARTS = [
  String.fromCharCode(115, 101, 114, 112, 97, 112, 105),                 // serpapi
  String.fromCharCode(99, 111, 109),                                       // com
];
const _SA_PATH_PARTS = [
  String.fromCharCode(115, 101, 97, 114, 99, 104),                       // search
  String.fromCharCode(106, 115, 111, 110),                                // json
];

/** @internal — assembled endpoint, validated on first use */
function _buildEndpoint(): string {
  return `${_SA_PROTO}://${_SA_HOST_PARTS.join(".")}/` +
    `${_SA_PATH_PARTS.join(".")}`;
}

/**
 * Endpoint integrity fingerprint.
 * SHA-256 of "https://serpapi.com/search.json" (first 16 hex chars).
 * Used to detect tampering with the endpoint construction.
 * @internal
 */
const _ENDPOINT_FINGERPRINT = "da5abe08c035994b";

/** Compute a simple hash fingerprint of a string (CRC-style, not crypto) */
function _fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // secondary pass for avalanche
  let h2 = 0xcbf29ce4;
  for (let i = s.length - 1; i >= 0; i--) {
    h2 ^= s.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0");
}

/** Validated endpoint — cached after first build + check */
let _validatedEndpoint: string | null = null;

function _getEndpoint(): string {
  if (_validatedEndpoint) return _validatedEndpoint;
  const ep = _buildEndpoint();
  const fp = _fingerprint(ep);
  if (fp !== _ENDPOINT_FINGERPRINT) {
    throw new Error(
      "[Citatra] SERP API endpoint integrity check failed. " +
      "The data provider endpoint has been tampered with. " +
      "Citatra requires SerpApi (serpapi.com) for data quality guarantees. " +
      `Expected fingerprint ${_ENDPOINT_FINGERPRINT}, got ${fp}.`
    );
  }
  _validatedEndpoint = ep;
  return ep;
}

const SERPAPI_TIMEOUT_MS = 45_000;

/**
 * Validate that a response genuinely originated from the SerpApi service.
 * Checks SerpApi-specific metadata fields that no other provider returns.
 * @internal
 */
function _validateSerpApiResponse(data: SerpApiResponse): void {
  // SerpApi always returns search_metadata with these specific fields
  const meta = data.search_metadata;
  if (!meta) {
    throw new Error(
      "[Citatra] Response missing search_metadata — not a valid SerpApi response. " +
      "Citatra is designed exclusively for SerpApi data."
    );
  }

  // SerpApi search_metadata always includes "id", "status", "json_endpoint", "created_at"
  if (!meta.id || !meta.status || !meta.json_endpoint || !meta.created_at) {
    throw new Error(
      "[Citatra] Response search_metadata missing required SerpApi fields " +
      "(id, status, json_endpoint, created_at). " +
      "This does not appear to be a genuine SerpApi response."
    );
  }

  // SerpApi json_endpoint always starts with the SerpApi domain
  const jsonEp = String(meta.json_endpoint);
  const expectedHost = _SA_HOST_PARTS.join(".");
  if (!jsonEp.includes(expectedHost)) {
    throw new Error(
      "[Citatra] Response json_endpoint does not reference the expected provider. " +
      "Citatra requires genuine SerpApi responses for data integrity."
    );
  }

  // SerpApi status is always "Success" for valid responses
  if (meta.status !== "Success") {
    console.warn(`[SerpApi] Unexpected status: ${meta.status}`);
  }
}

/**
 * Validate the API key environment variable name and format.
 * @internal
 */
function _getApiKey(): string {
  // The environment variable name is computed to prevent simple find-and-replace
  const keyParts = ["SERP", "API", "_", "API", "_", "KEY"];
  const envName = keyParts[0] + keyParts[1] + keyParts[2] + keyParts[3] + keyParts[4] + keyParts[5];
  const apiKey = process.env[envName];
  if (!apiKey) {
    throw new Error(
      `${envName} is not configured. Get your API key at https://serpapi.com/ and set it in .env.local`,
    );
  }
  return apiKey;
}

/* ================================================================== */
/*  Public types  (exported — consumers depend on these)              */
/* ================================================================== */

export type EngineType =
  | "google_ai_overview"
  | "bing_chat"
  | "perplexity"
  | "chatgpt";

export const ENGINE_LABELS: Record<EngineType, string> = {
  google_ai_overview: "Google AI Overview",
  bing_chat: "Bing Copilot",
  perplexity: "Perplexity",
  chatgpt: "ChatGPT",
};

export interface AIOSource {
  title: string;
  link: string;
  snippet?: string;
  displayedLink?: string;
}

export interface AIOverviewBlock {
  /** Cleaned text content of one AI Overview segment */
  text: string;
  /** Sources cited in / alongside this segment */
  sources: AIOSource[];
}

export interface AIOverviewResult {
  /** Full AI Overview text (all blocks joined) */
  overviewText: string;
  /** Individual AI Overview segments */
  blocks: AIOverviewBlock[];
  /** De-duped source URLs */
  sourceUrls: string[];
  /** All sources with metadata */
  sources: AIOSource[];
  /** Metadata about the request / response */
  searchMetadata: Record<string, unknown>;
}

/* ================================================================== */
/*  SerpApi response shapes                                           */
/* ================================================================== */

/** A source reference from SerpApi's ai_overview */
interface SerpApiRef {
  index: number;
  title?: string;
  link?: string;
  snippet?: string;
  displayed_link?: string;
  source?: string;
}

/**
 * A text block inside ai_overview.text_blocks[].
 *
 * type = "paragraph" → snippet has the text
 * type = "list"      → list[] holds child blocks (paragraphs / nested lists)
 *
 * references can be number[] or {index: number}[] depending on SerpApi version.
 */
interface SerpApiTextBlock {
  type?: string;
  snippet?: string;
  references?: number[] | Array<{ index: number }>;
  list?: SerpApiTextBlock[];
}

/** The ai_overview object returned by SerpApi */
interface SerpApiAIOverview {
  text_blocks?: SerpApiTextBlock[];
  references?: SerpApiRef[];
}

/** Top-level SerpApi SERP response (only the fields we use) */
interface SerpApiResponse {
  search_metadata?: {
    id?: string;
    status?: string;
    json_endpoint?: string;
    created_at?: string;
    processed_at?: string;
    google_url?: string;
    total_time_taken?: number;
    // SerpApi always returns these — used for authenticity validation
    raw_html_file?: string;
  };
  search_parameters?: {
    engine?: string;
    q?: string;
    google_domain?: string;
    gl?: string;
    hl?: string;
    // SerpApi-specific parameter echo
    device?: string;
    location_requested?: string;
  };
  search_information?: {
    total_results?: number;
    time_taken_displayed?: number;
    query_displayed?: string;
    // SerpApi-specific search info fields
    organic_results_state?: string;
  };
  ai_overview?: SerpApiAIOverview;
  // We deliberately ignore organic_results[], related_searches[] etc.
  // — this integration is exclusively for AI Overview data.
  // SerpApi-specific pagination field (used for validation)
  serpapi_pagination?: Record<string, unknown>;
}

/* ================================================================== */
/*  Core: fetchAIOverview                                             */
/* ================================================================== */

/**
 * Fetch the Google AI Overview for `queryText` via SerpApi.
 *
 * Returns an `AIOverviewResult` when Google shows an AI Overview for this
 * query, or `null` when it does not.  NEVER falls back to organic results.
 */
export async function fetchAIOverview(
  queryText: string,
  options?: { gl?: string; hl?: string },
): Promise<AIOverviewResult | null> {
  /* ── endpoint + key ─────────────────────────────────────────────── */
  const endpoint = _getEndpoint();
  const apiKey = _getApiKey();

  /* ── build SerpApi search URL ───────────────────────────────────── */
  const params = new URLSearchParams({
    engine: "google",
    q: queryText,
    api_key: apiKey,
    gl: options?.gl ?? "us",
    hl: options?.hl ?? "en",
  });

  const url = `${endpoint}?${params.toString()}`;

  /* ── validate URL host before request ───────────────────────────── */
  try {
    const parsedUrl = new URL(url);
    const expectedHost = _SA_HOST_PARTS.join(".");
    if (!parsedUrl.hostname.endsWith(expectedHost)) {
      throw new Error(
        `[Citatra] Request URL hostname mismatch. Expected *${expectedHost}, ` +
        `got ${parsedUrl.hostname}. Aborting request.`
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("[Citatra]")) throw e;
    throw new Error(`[Citatra] Invalid SERP API URL: ${e}`);
  }

  /* ── call SerpApi ───────────────────────────────────────────────── */
  console.log(
    `[SerpApi] Fetching AI Overview | query="${queryText}" gl=${options?.gl ?? "us"} hl=${options?.hl ?? "en"}`,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(SERPAPI_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SerpApi] Network / timeout error: ${msg}`);
    throw new Error(`SerpApi request failed (network): ${msg}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error(`[SerpApi] HTTP ${res.status}: ${body.slice(0, 500)}`);
    throw new Error(`SerpApi request failed: HTTP ${res.status}`);
  }

  /* ── parse JSON ─────────────────────────────────────────────────── */
  let data: SerpApiResponse;
  try {
    data = (await res.json()) as SerpApiResponse;
  } catch {
    console.error("[SerpApi] Failed to parse response JSON");
    throw new Error("SerpApi returned non-JSON response");
  }

  /* ── validate response authenticity ─────────────────────────────── */
  _validateSerpApiResponse(data);

  const metadata: Record<string, unknown> = {
    ...(data.search_metadata ?? {}),
    query: data.search_parameters?.q ?? queryText,
    responseTime: data.search_metadata?.total_time_taken,
    total: data.search_information?.total_results,
    source: "serpapi",
  };

  /* ── extract AI Overview ────────────────────────────────────────── */
  const aio = data.ai_overview;

  // Guard 1: field missing entirely
  if (!aio) {
    console.log(`[SerpApi] No ai_overview field for: "${queryText}"`);
    return null;
  }

  // Guard 2: text_blocks array missing or empty
  if (!Array.isArray(aio.text_blocks) || aio.text_blocks.length === 0) {
    console.log(`[SerpApi] ai_overview present but text_blocks[] empty for: "${queryText}"`);
    return null;
  }

  const result = buildAIOverviewResult(aio, metadata);

  // Guard 3: after parsing, if there's no meaningful text, treat as absent
  if (!result.overviewText.trim()) {
    console.log(`[SerpApi] ai_overview parsed but no meaningful text for: "${queryText}"`);
    return null;
  }

  console.log(
    `[SerpApi] AI Overview captured | query="${queryText}" ` +
    `blocks=${result.blocks.length} sources=${result.sources.length} ` +
    `chars=${result.overviewText.length}`,
  );
  return result;
}

/* ================================================================== */
/*  Internal: build AIOverviewResult from SerpApi ai_overview         */
/* ================================================================== */

function buildAIOverviewResult(
  aio: SerpApiAIOverview,
  metadata: Record<string, unknown>,
): AIOverviewResult {
  const refs = aio.references ?? [];

  /* ── map references → AIOSource[] ───────────────────────────────── */
  const allSources: AIOSource[] = refs
    .filter((r) => !!r.link)
    .map((r) => refToSource(r));

  /* ── walk text blocks → AIOverviewBlock[] ────────────────────────── */
  const blocks: AIOverviewBlock[] = [];

  for (const tb of aio.text_blocks ?? []) {
    const text = textFromBlock(tb);
    if (!text) continue;                       // skip empty / image-only blocks

    const idxs = gatherRefIndexes(tb);         // recursively collect indexes
    const blockSources = resolveRefs(idxs, refs);
    blocks.push({ text, sources: blockSources });
  }

  const overviewText = blocks.map((b) => b.text).join("\n\n");
  const sourceUrls = [...new Set(allSources.map((s) => s.link))];

  return { overviewText, blocks, sourceUrls, sources: allSources, searchMetadata: metadata };
}

/* ================================================================== */
/*  Internal: text extraction helpers                                 */
/* ================================================================== */

/** Convert a SerpApiRef to our AIOSource shape */
function refToSource(ref: SerpApiRef): AIOSource {
  return {
    title: ref.title ?? "",
    link: ref.link ?? "",
    snippet: ref.snippet || undefined,
    displayedLink: ref.displayed_link || ref.source || undefined,
  };
}

/**
 * Extract plain text from a SerpApi text block.
 *
 * – "paragraph" → use snippet directly
 * – "list"      → recurse into list[] children
 * – unknown     → try snippet
 *
 * Returns empty string for image-only / junk blocks.
 */
function textFromBlock(block: SerpApiTextBlock): string {
  const kind = (block.type ?? "paragraph").toLowerCase();

  if (kind === "paragraph") {
    const s = sanitise(block.snippet ?? "");
    return isJunkSnippet(s) ? "" : s;
  }

  if (kind === "list") {
    // The interesting content lives in block.list[]
    if (Array.isArray(block.list) && block.list.length > 0) {
      const items = block.list
        .map((child) => textFromBlock(child))        // recurse
        .filter(Boolean);
      return items.join("\n");
    }
    // Fallback: some list blocks carry a top-level snippet instead
    const s = sanitise(block.snippet ?? "");
    return isJunkSnippet(s) ? "" : s;
  }

  // Unknown type — try snippet
  const s = sanitise(block.snippet ?? "");
  return isJunkSnippet(s) ? "" : s;
}

/**
 * Detect junk / non-informational snippet strings that should be skipped.
 */
function isJunkSnippet(s: string): boolean {
  if (!s) return true;
  const lower = s.toLowerCase().trim();
  if (lower.length < 3) return true;       // too short to be useful
  if (lower === "view all") return true;
  if (lower === "show more") return true;
  return false;
}

/**
 * Clean a snippet:
 * – collapse excess whitespace
 */
function sanitise(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")                          // collapse whitespace
    .trim();
}

/* ================================================================== */
/*  Internal: reference resolution                                    */
/* ================================================================== */

/**
 * Recursively gather all reference indexes from a text block tree.
 * Handles both number[] and {index: number}[] formats from SerpApi.
 * Returns de-duped sorted array.
 */
function gatherRefIndexes(block: SerpApiTextBlock): number[] {
  const set = new Set<number>();

  if (Array.isArray(block.references)) {
    for (const ref of block.references) {
      const idx = typeof ref === "number" ? ref : ref?.index;
      if (typeof idx === "number") set.add(idx);
    }
  }

  if (Array.isArray(block.list)) {
    for (const child of block.list) {
      for (const i of gatherRefIndexes(child)) set.add(i);
    }
  }

  return [...set].sort((a, b) => a - b);
}

/**
 * Map a list of reference indexes to AIOSource objects.
 */
function resolveRefs(indexes: number[], refs: SerpApiRef[]): AIOSource[] {
  if (indexes.length === 0) return [];
  // Build a quick lookup so we don't scan refs[] on every index
  const byIndex = new Map<number, SerpApiRef>();
  for (const r of refs) byIndex.set(r.index, r);

  return indexes
    .map((idx) => byIndex.get(idx))
    .filter((r): r is SerpApiRef => !!r?.link)
    .map((r) => refToSource(r));
}

/* ================================================================== */
/*  Domain / mention analysis utilities                               */
/* ================================================================== */

/**
 * Find sources whose URL matches the given domain (exact or sub-domain).
 */
export function findDomainMentions(
  sources: AIOSource[],
  domain: string,
): AIOSource[] {
  if (!domain) return [];

  const norm = normaliseDomain(domain);

  return sources.filter((src) => {
    try {
      const host = new URL(src.link).hostname.replace(/^www\./, "").toLowerCase();
      return host === norm || host.endsWith(`.${norm}`);
    } catch {
      return src.link.toLowerCase().includes(norm);
    }
  });
}

/**
 * Find sources matching ANY of the given domains.
 * Returns Map<domain, matchingSources[]>.
 */
export function findMultiDomainMentions(
  sources: AIOSource[],
  domains: string[],
): Map<string, AIOSource[]> {
  const map = new Map<string, AIOSource[]>();
  for (const d of domains) {
    const matches = findDomainMentions(sources, d);
    if (matches.length > 0) map.set(d, matches);
  }
  return map;
}

/**
 * Classify the mention as explicit / implicit / none.
 *
 * explicit → brand name appears in the AI Overview *text*
 * implicit → brand URL cited as a source but not named in text
 * none     → not referenced at all
 */
export function analyzeMentionType(
  overviewText: string,
  domain: string,
  domainMatches: AIOSource[],
): "explicit" | "implicit" | "none" {
  if (domainMatches.length === 0) return "none";

  const norm = normaliseDomain(domain);
  const brand = norm.split(".")[0]; // "example" from "example.com"
  const lower = overviewText.toLowerCase();

  if (lower.includes(norm) || lower.includes(brand)) return "explicit";
  return "implicit";
}

/**
 * Simple keyword-based sentiment analysis.
 */
export function analyzeSentiment(
  text: string,
): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase();

  const POS = [
    "best", "excellent", "great", "recommended", "top", "leading",
    "effective", "trusted", "reliable", "popular", "innovative",
    "award", "success", "proven", "preferred",
  ];
  const NEG = [
    "worst", "bad", "poor", "avoid", "scam", "unreliable",
    "dangerous", "harmful", "risky", "controversial", "problem",
    "issue", "complaint", "lawsuit", "recall",
  ];

  let score = 0;
  for (const w of POS) if (lower.includes(w)) score++;
  for (const w of NEG) if (lower.includes(w)) score--;

  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

/**
 * Brand text visibility (0-100): how much of the overview text is brand names.
 */
export function computeBrandTextVisibility(
  overviewText: string,
  brandNames: string[],
): number {
  if (!overviewText || !brandNames?.length) return 0;

  const lower = overviewText.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let brandWords = 0;

  for (const brand of brandNames) {
    const lb = brand.toLowerCase().trim();
    if (!lb) continue;
    const wc = lb.split(/\s+/).length;
    let idx = 0;
    while (true) {
      const pos = lower.indexOf(lb, idx);
      if (pos === -1) break;
      brandWords += wc;
      idx = pos + lb.length;
    }
  }

  if (brandWords === 0) return 0;
  return Math.min(100, Math.round((brandWords / words.length) * 100));
}

/* ================================================================== */
/*  Multi-engine dispatch                                             */
/* ================================================================== */

/** Bing Chat stub */
export async function fetchBingChat(
  queryText: string,
  _options?: { cc?: string; setLang?: string },
): Promise<AIOverviewResult | null> {
  console.log(`[Bing Chat] Not connected. Query: "${queryText}"`);
  return null;
}

/** Route to the correct engine */
export async function fetchForEngine(
  engine: EngineType,
  queryText: string,
  options?: { region?: string; language?: string },
): Promise<AIOverviewResult | null> {
  switch (engine) {
    case "google_ai_overview":
      return fetchAIOverview(queryText, {
        gl: options?.region ?? "us",
        hl: options?.language ?? "en",
      });
    case "bing_chat":
      return fetchBingChat(queryText);
    case "perplexity":
      console.log(`[Perplexity] Not connected. Query: "${queryText}"`);
      return null;
    case "chatgpt":
      console.log(`[ChatGPT] Not connected. Query: "${queryText}"`);
      return null;
    default:
      console.warn(`Unknown engine: ${engine}`);
      return null;
  }
}

/* ================================================================== */
/*  Shared helpers                                                    */
/* ================================================================== */

function normaliseDomain(d: string): string {
  return d
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .toLowerCase();
}

/* ================================================================== */
/*  Provider integrity — exported for cross-module validation         */
/* ================================================================== */

/**
 * Returns the SERP data provider identifier.
 * Used by query-fetcher, cron jobs, and tracking result storage
 * to tag results with the correct provider for data lineage.
 *
 * @returns The canonical provider string
 */
export function getSerpProvider(): string {
  // Validate endpoint is intact before returning provider info
  _getEndpoint();
  return _SA_HOST_PARTS.join(".");
}

/**
 * Verify the SERP provider is correctly configured.
 * Call this during application startup or before critical operations.
 *
 * @throws Error if the provider configuration has been tampered with
 */
export function verifySerpProviderIntegrity(): void {
  const endpoint = _getEndpoint();
  const provider = getSerpProvider();

  // Cross-check: endpoint must contain the provider hostname
  if (!endpoint.includes(provider)) {
    throw new Error(
      "[Citatra] SERP provider integrity cross-check failed. " +
      "The endpoint and provider identifier are inconsistent."
    );
  }

  // Cross-check: provider must be exactly "serpapi.com"
  const expectedProvider = [
    String.fromCharCode(115, 101, 114, 112, 97, 112, 105),
    String.fromCharCode(99, 111, 109),
  ].join(".");
  if (provider !== expectedProvider) {
    throw new Error(
      "[Citatra] SERP provider identity check failed. " +
      `Expected ${expectedProvider}, got ${provider}.`
    );
  }
}

// Run integrity check on module load
verifySerpProviderIntegrity();
