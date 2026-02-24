/**
 * Query ↔ Page Matching — hybrid approach combining slug, token-IDF,
 * semantic similarity, and agent-request provenance.
 *
 * Replaces the naive 50% keyword overlap with a weighted, multi-signal scorer.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MatchCandidate {
  canonicalUrl: string;
  slug: string;
  title: string;
  pageType: string;
  /** Pre-computed page embedding (optional, may be empty) */
  embedding: number[];
  /** Tokenised page text (title + keywords) */
  tokens: string[];
  /** Recent agent request count (from AgentRequest events) */
  recentAgentRequests: number;
  /** Which engines accessed this page recently */
  recentAgentEngines: string[];
}

export interface MatchResult {
  canonicalUrl: string;
  matchConfidence: number; // 0–1
  slugScore: number;
  tokenOverlapScore: number;
  semanticScore: number;
  provenanceBoost: number;
}

/* ------------------------------------------------------------------ */
/*  Tokeniser                                                          */
/* ------------------------------------------------------------------ */

/** Tokenise text into lowercase word stems (simple whitespace + punctuation split). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/* ------------------------------------------------------------------ */
/*  IDF calculation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build an IDF map from a corpus of token arrays.
 * IDF = log(N / (1 + df)) where df is the number of documents containing the term.
 */
export function buildIdfMap(corpus: string[][]): Map<string, number> {
  const docCount = corpus.length;
  const df = new Map<string, number>();

  for (const tokens of corpus) {
    const unique = new Set(tokens);
    for (const t of unique) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((docCount + 1) / (1 + count)));
  }

  return idf;
}

/* ------------------------------------------------------------------ */
/*  Slug match                                                         */
/* ------------------------------------------------------------------ */

function computeSlugScore(queryText: string, pageSlug: string): number {
  if (!pageSlug) return 0;

  const querySlug = queryText
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  // Exact slug match
  if (pageSlug === querySlug) return 1.0;

  // Slug contains query slug
  if (pageSlug.includes(querySlug) && querySlug.length > 3) return 0.8;

  // Query slug contains page slug
  if (querySlug.includes(pageSlug) && pageSlug.length > 3) return 0.6;

  return 0;
}

/* ------------------------------------------------------------------ */
/*  IDF-weighted token overlap                                         */
/* ------------------------------------------------------------------ */

function computeTokenOverlap(
  queryTokens: string[],
  pageTokens: string[],
  idfMap: Map<string, number>
): number {
  if (queryTokens.length === 0 || pageTokens.length === 0) return 0;

  const pageSet = new Set(pageTokens);
  let weightedOverlap = 0;
  let totalWeight = 0;

  for (const qt of queryTokens) {
    const weight = idfMap.get(qt) || 1.0;
    totalWeight += weight;
    if (pageSet.has(qt)) {
      weightedOverlap += weight;
    }
  }

  return totalWeight > 0 ? weightedOverlap / totalWeight : 0;
}

/* ------------------------------------------------------------------ */
/*  Cosine similarity                                                  */
/* ------------------------------------------------------------------ */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

/* ------------------------------------------------------------------ */
/*  Provenance boost                                                   */
/* ------------------------------------------------------------------ */

const PROVENANCE_THRESHOLD = 1; // At least 1 recent agent request

function computeProvenanceBoost(
  recentAgentRequests: number,
  _recentEngines: string[]
): number {
  if (recentAgentRequests >= PROVENANCE_THRESHOLD) return 1.0;
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Composite matcher                                                  */
/* ------------------------------------------------------------------ */

/** Weights for each signal in the composite match score. */
const WEIGHTS = {
  semantic: 0.60,
  tokenOverlap: 0.25,
  slugMatch: 0.10,
  provenance: 0.05,
};

/**
 * Compute match confidence between a query and a set of candidate pages.
 *
 * @param queryText      - The raw query text
 * @param queryEmbedding - Optional pre-computed query embedding
 * @param candidates     - Array of candidate pages to match against
 * @param idfMap         - Pre-built IDF map from workspace corpus
 * @param topN           - Maximum number of results to return (default 10)
 * @param minConfidence  - Minimum confidence threshold (default 0.1)
 */
export function matchQueryToPages(
  queryText: string,
  queryEmbedding: number[] | null,
  candidates: MatchCandidate[],
  idfMap: Map<string, number>,
  topN = 10,
  minConfidence = 0.1
): MatchResult[] {
  const queryTokens = tokenize(queryText);

  const results: MatchResult[] = [];

  for (const page of candidates) {
    const slugScore = computeSlugScore(queryText, page.slug);

    const tokenOverlapScore = computeTokenOverlap(queryTokens, page.tokens, idfMap);

    const semanticScore =
      queryEmbedding && page.embedding.length > 0
        ? cosineSimilarity(queryEmbedding, page.embedding)
        : 0;

    const provenanceBoost = computeProvenanceBoost(
      page.recentAgentRequests,
      page.recentAgentEngines
    );

    // If no embedding available, redistribute semantic weight to token overlap
    let confidence: number;
    if (!queryEmbedding || page.embedding.length === 0) {
      confidence =
        0.55 * tokenOverlapScore +
        0.35 * slugScore +
        0.10 * provenanceBoost;
    } else {
      confidence =
        WEIGHTS.semantic * semanticScore +
        WEIGHTS.tokenOverlap * tokenOverlapScore +
        WEIGHTS.slugMatch * slugScore +
        WEIGHTS.provenance * provenanceBoost;
    }

    // Clamp to [0, 1]
    confidence = Math.max(0, Math.min(1, confidence));

    if (confidence >= minConfidence) {
      results.push({
        canonicalUrl: page.canonicalUrl,
        matchConfidence: confidence,
        slugScore,
        tokenOverlapScore,
        semanticScore,
        provenanceBoost,
      });
    }
  }

  // Sort by confidence descending, return top N
  results.sort((a, b) => b.matchConfidence - a.matchConfidence);
  return results.slice(0, topN);
}

/**
 * Simple clamp helper.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
