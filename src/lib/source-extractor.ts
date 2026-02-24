/**
 * Source extraction & persistence.
 *
 * Called after each query fetch to upsert Source documents from the
 * tracking results. This builds the Sources dataset that powers the
 * domain-level and URL-level analysis views.
 */

import Source from "@/models/Source";
import Competitor from "@/models/Competitor";
import Workspace from "@/models/Workspace";
import {
  classifyDomain,
  classifyUrlType,
  extractDomain,
} from "@/lib/source-classifier";
import type { AIOSource } from "@/lib/serp-api";

export interface SourceExtractionInput {
  tenantId: string;
  /** Optional — omitted for playground / ad-hoc tests */
  queryId?: string;
  engine: string;
  sources: AIOSource[];
  /** Brands/domains detected in the overview text */
  mentionedBrands?: string[];
}

/**
 * Upsert Source documents for every URL seen in an AI response.
 * Increments usage counters, updates classification, and records mentions.
 */
export async function extractAndUpsertSources(
  input: SourceExtractionInput
): Promise<number> {
  const { tenantId, queryId, engine, sources, mentionedBrands = [] } = input;

  if (sources.length === 0) return 0;

  // Fetch workspace + competitor info for classification
  const [workspace, competitors] = await Promise.all([
    Workspace.findById(tenantId).lean(),
    Competitor.find({ tenantId }).lean(),
  ]);

  const workspaceDomain = workspace?.domain || "";
  const competitorDomains = competitors.map((c) => c.domain);

  let upsertCount = 0;

  for (const src of sources) {
    if (!src.link || src.link === "no-source") continue;

    const domain = extractDomain(src.link);
    const domainType = classifyDomain(domain, workspaceDomain, competitorDomains);
    const urlType = classifyUrlType(src.link, src.title);

    try {
      await Source.findOneAndUpdate(
        { tenantId, url: src.link },
        {
          $set: {
            domain,
            domainType,
            urlType,
            title: src.title || "",
            lastSeenAt: new Date(),
          },
          $inc: {
            usedTotal: 1,
            totalCitations: 1,
          },
          $addToSet: {
            engines: engine,
            ...(queryId ? { queryIds: queryId } : {}),
            mentionedBrands: { $each: mentionedBrands },
          },
          $setOnInsert: {
            tenantId,
            url: src.link,
          },
        },
        { upsert: true, new: true }
      );
      upsertCount++;
    } catch (err) {
      // Duplicate key race condition — safe to ignore
      if ((err as { code?: number }).code !== 11000) {
        console.error(`[Sources] Failed to upsert source ${src.link}:`, err);
      }
    }
  }

  return upsertCount;
}
