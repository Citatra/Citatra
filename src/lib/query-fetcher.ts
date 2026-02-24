/**
 * Shared utility to perform AI Overview fetching for a query.
 *
 * Extracted from the fetch API route so it can be called from:
 * - POST /queries (auto-fetch on creation)
 * - POST /queries/bulk (auto-fetch each)
 * - PATCH /queries/[queryId] (auto-fetch on activation)
 * - POST /queries/[queryId]/fetch (manual trigger)
 * - Cron jobs (scheduled fetching)
 *
 * Safe to call fire-and-forget with `.catch(console.error)`.
 */

import { connectToDatabase } from "@/lib/mongodb";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";
import Workspace from "@/models/Workspace";
import Competitor from "@/models/Competitor";
import {
  fetchForEngine,
  findDomainMentions,
  findMultiDomainMentions,
  analyzeMentionType,
  analyzeSentiment,
  computeBrandTextVisibility,
  verifySerpProviderIntegrity,
  getSerpProvider,
  type EngineType,
} from "@/lib/serp-api";
import { triggerEvent } from "@/lib/pusher-server";
import { createNotification, detectBrandChange } from "@/lib/notifications";
import { extractAndUpsertSources } from "@/lib/source-extractor";

export interface FetchResult {
  resultsCount: number;
  brandMentioned: boolean;
}

/**
 * Perform a full AI Overview fetch for a single query, saving
 * TrackingResult documents, updating lastFetchedAt, and emitting
 * Pusher events + notifications.
 */
export async function performQueryFetch(
  workspaceId: string,
  queryId: string
): Promise<FetchResult> {
  // Verify SERP provider integrity before every fetch operation
  verifySerpProviderIntegrity();

  await connectToDatabase();

  const query = await Query.findOne({ _id: queryId, tenantId: workspaceId });
  if (!query) throw new Error(`Query ${queryId} not found`);

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  const competitors = await Competitor.find({ tenantId: workspaceId }).lean();
  const competitorDomains = competitors.map((c) => c.domain);

  const engines: EngineType[] =
    query.engines && query.engines.length > 0
      ? query.engines
      : ["google_ai_overview"];

  const domain = workspace.domain || "";
  const brandNames: string[] = workspace.brandNames || [];
  const fetchedAt = new Date();
  let savedCount = 0;
  let anyBrandMentioned = false;

  for (const engine of engines) {
    const aiOverview = await fetchForEngine(engine, query.queryText, {
      region: workspace.region || "us",
      language: workspace.language || "en",
    });

    if (!aiOverview) continue;

    const domainMentions = findDomainMentions(aiOverview.sources, domain);
    const isBrandMentioned = domainMentions.length > 0;
    if (isBrandMentioned) anyBrandMentioned = true;

    const mentionType = analyzeMentionType(
      aiOverview.overviewText,
      domain,
      domainMentions
    );
    const sentiment = analyzeSentiment(aiOverview.overviewText);
    const brandTextVisibility = computeBrandTextVisibility(
      aiOverview.overviewText,
      brandNames
    );

    const competitorMentionMap = findMultiDomainMentions(
      aiOverview.sources,
      competitorDomains
    );

    // Extract and upsert sources for the Sources analytics page
    const detectedBrands: string[] = [];
    if (domain && aiOverview.overviewText.toLowerCase().includes(domain.replace(/^www\./, "").split(".")[0])) {
      detectedBrands.push(domain);
    }
    for (const cd of competitorDomains) {
      if (aiOverview.overviewText.toLowerCase().includes(cd.replace(/^www\./, "").split(".")[0])) {
        detectedBrands.push(cd);
      }
    }
    await extractAndUpsertSources({
      tenantId: workspaceId,
      queryId: query._id.toString(),
      engine,
      sources: aiOverview.sources,
      mentionedBrands: detectedBrands,
    }).catch((err) => console.error("[Sources] Extraction error:", err));

    if (aiOverview.sources.length > 0) {
      for (let idx = 0; idx < aiOverview.sources.length; idx++) {
        const source = aiOverview.sources[idx];
        const isDomainMatch = domainMentions.some(
          (dm) => dm.link === source.link
        );

        let matchedCompetitorDomain = "";
        for (const [compDomain, compSources] of competitorMentionMap) {
          if (compSources.some((cs) => cs.link === source.link)) {
            matchedCompetitorDomain = compDomain;
            break;
          }
        }

        await TrackingResult.create({
          queryId: query._id,
          tenantId: workspaceId,
          contentSnippet:
            source.snippet || aiOverview.overviewText.substring(0, 500),
          sourceUrl: source.link,
          engine,
          isBrandMentioned: isDomainMatch,
          brandTextVisibility,
          mentionType: isDomainMatch ? mentionType : "none",
          sentiment,
          competitorDomain: matchedCompetitorDomain,
          sourcePosition: idx + 1,
          overviewText: aiOverview.overviewText,
          metadata: {
            sourceTitle: source.title,
            displayedLink: source.displayedLink,
            overviewTextLength: aiOverview.overviewText.length,
            totalSources: aiOverview.sources.length,
            blocksCount: aiOverview.blocks.length,
            provider: getSerpProvider(),
          },
          fetchedAt,
        });
        savedCount++;
      }
    } else {
      await TrackingResult.create({
        queryId: query._id,
        tenantId: workspaceId,
        contentSnippet: aiOverview.overviewText.substring(0, 1000),
        sourceUrl: "",
        engine,
        isBrandMentioned: false,
        brandTextVisibility,
        mentionType: "none",
        sentiment,
        competitorDomain: "",
        sourcePosition: 0,
        overviewText: aiOverview.overviewText,
        metadata: {
          overviewTextLength: aiOverview.overviewText.length,
          blocksCount: aiOverview.blocks.length,
          provider: getSerpProvider(),
        },
        fetchedAt,
      });
      savedCount++;
    }
  }

  // Update query's lastFetchedAt
  await Query.updateOne({ _id: queryId }, { lastFetchedAt: fetchedAt });

  // Pusher: push real-time update
  await triggerEvent(workspaceId, "query:fetched", {
    queryId: query._id.toString(),
    queryText: query.queryText,
    isBrandMentioned: anyBrandMentioned,
    engines,
    resultsCount: savedCount,
    fetchedAt: fetchedAt.toISOString(),
  }).catch(() => {});

  await triggerEvent(workspaceId, "stats:updated", {
    timestamp: fetchedAt.toISOString(),
  }).catch(() => {});

  // Notifications: detect brand mention/drop changes
  const previousResult = await TrackingResult.findOne({
    queryId: query._id,
    fetchedAt: { $lt: fetchedAt },
  })
    .sort({ fetchedAt: -1 })
    .lean();

  const previouslyMentioned = previousResult?.isBrandMentioned || false;
  const change = detectBrandChange(previouslyMentioned, anyBrandMentioned);

  if (change === "mentioned") {
    await createNotification({
      tenantId: workspaceId,
      type: "brand_mentioned",
      title: "Brand mentioned in AI Overview",
      message: `Your domain "${domain}" was mentioned in the AI Overview for "${query.queryText}".`,
      metadata: {
        queryId: query._id.toString(),
        queryText: query.queryText,
      },
    }).catch(() => {});
  } else if (change === "dropped") {
    await createNotification({
      tenantId: workspaceId,
      type: "brand_dropped",
      title: "Brand dropped from AI Overview",
      message: `Your domain "${domain}" is no longer mentioned in the AI Overview for "${query.queryText}".`,
      metadata: {
        queryId: query._id.toString(),
        queryText: query.queryText,
      },
    }).catch(() => {});
  }

  return { resultsCount: savedCount, brandMentioned: anyBrandMentioned };
}

/**
 * Module-level sequential fetch queue.
 * All background fetches are chained so only ONE Bright Data call is in-flight
 * at a time, preventing rate-limit failures when many prompts are created or
 * refreshed simultaneously.
 */
let fetchQueue: Promise<void> = Promise.resolve();
const FETCH_DELAY_MS = 1500; // pause between consecutive fetches

/**
 * Enqueue a background fetch for a query.
 * Calls are serialised: each waits for the previous to finish before starting.
 * Safe to call multiple times in rapid succession (bulk creation, refresh).
 */
export function triggerBackgroundFetch(
  workspaceId: string,
  queryId: string
): void {
  fetchQueue = fetchQueue.then(async () => {
    await performQueryFetch(workspaceId, queryId).catch((err) => {
      console.error(
        `[Background Fetch] Failed for query ${queryId}:`,
        err instanceof Error ? err.message : err
      );
    });
    // Brief pause before the next queued fetch to stay within API rate limits
    await new Promise((resolve) => setTimeout(resolve, FETCH_DELAY_MS));
  });
}
