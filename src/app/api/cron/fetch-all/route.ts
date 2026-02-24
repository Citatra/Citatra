import { NextResponse } from "next/server";
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
  type EngineType,
} from "@/lib/serp-api";
import { triggerEvent } from "@/lib/pusher-server";
import { createNotification, detectBrandChange } from "@/lib/notifications";

export const runtime = "nodejs";

// Maximum concurrent fetches to avoid rate-limiting
const CONCURRENCY = 3;
// Delay between batches (ms)
const BATCH_DELAY = 2000;

/**
 * POST /api/cron/fetch-all
 *
 * Cron-triggered endpoint that fetches AI Overview data for ALL active queries
 * across ALL workspaces. Designed to be called by Vercel Cron Jobs (nightly, or
 * on whatever interval you configure).
 *
 * Protected by CRON_SECRET — Vercel sends this automatically for cron jobs.
 * Alternatively call manually with Authorization: Bearer <CRON_SECRET>.
 */
export async function POST(req: Request) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const token = authHeader?.replace("Bearer ", "");
      if (token !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    // In development, allow without secret for testing

    // Verify SERP provider integrity before batch processing
    verifySerpProviderIntegrity();

    await connectToDatabase();

    // Get all active queries
    const allQueries = await Query.find({ status: "active" })
      .sort({ lastFetchedAt: 1 }) // oldest first
      .lean();

    if (allQueries.length === 0) {
      return NextResponse.json({
        message: "No active queries to fetch",
        processed: 0,
        succeeded: 0,
        failed: 0,
      });
    }

    // Pre-fetch all workspaces we'll need
    const workspaceIds = [...new Set(allQueries.map((q) => q.tenantId.toString()))];
    const workspaces = await Workspace.find({
      _id: { $in: workspaceIds },
    }).lean();
    const workspaceMap = new Map(
      workspaces.map((ws) => [ws._id.toString(), ws])
    );

    // Filter queries based on each workspace's updateFrequency setting.
    // The cron runs twice daily (2 AM and 2 PM UTC).
    // - "twice_daily" → always fetch on every cron run
    // - "daily"       → fetch only if last fetch was >20 hours ago
    // - "weekly"      → fetch only if last fetch was >6 days ago (or never)
    const now = Date.now();
    const TWENTY_HOURS_MS = 20 * 60 * 60 * 1000;
    const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

    const queries = allQueries.filter((query) => {
      const ws = workspaceMap.get(query.tenantId.toString());
      if (!ws) return true; // fetch anyway if workspace lookup fails
      const freq = (ws as unknown as Record<string, unknown>).updateFrequency as string | undefined;
      const lastFetched = query.lastFetchedAt ? new Date(query.lastFetchedAt).getTime() : 0;

      if (freq === "weekly") {
        return now - lastFetched >= SIX_DAYS_MS;
      }
      if (freq === "twice_daily") {
        return true; // always fetch
      }
      // "daily" (default) → skip if fetched within last 20 hours
      return now - lastFetched >= TWENTY_HOURS_MS;
    });

    if (queries.length === 0) {
      return NextResponse.json({
        message: "No queries due for refresh based on workspace frequency settings",
        totalActive: allQueries.length,
        processed: 0,
        succeeded: 0,
        failed: 0,
      });
    }

    // Pre-fetch competitors per workspace
    const allCompetitors = await Competitor.find({
      tenantId: { $in: workspaceIds },
    }).lean();
    const competitorsByWorkspace = new Map<string, string[]>();
    for (const comp of allCompetitors) {
      const wsId = comp.tenantId.toString();
      if (!competitorsByWorkspace.has(wsId)) {
        competitorsByWorkspace.set(wsId, []);
      }
      competitorsByWorkspace.get(wsId)!.push(comp.domain);
    }

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      noOverview: 0,
      brandMentions: 0,
      errors: [] as string[],
    };

    // Process in batches for rate-limiting
    for (let i = 0; i < queries.length; i += CONCURRENCY) {
      const batch = queries.slice(i, i + CONCURRENCY);

      const batchPromises = batch.map(async (query) => {
        try {
          const workspace = workspaceMap.get(query.tenantId.toString());
          if (!workspace) {
            results.errors.push(
              `Query "${query.queryText}": workspace not found`
            );
            results.failed++;
            return;
          }

          const domain = workspace.domain || "";
          const brandNames: string[] = (workspace as unknown as { brandNames?: string[] }).brandNames || [];
          const competitorDomains =
            competitorsByWorkspace.get(query.tenantId.toString()) || [];

          // Multi-engine: fetch for each engine configured on the query
          const engines: EngineType[] =
            query.engines && query.engines.length > 0
              ? query.engines
              : ["google_ai_overview"];

          let anyBrandMentioned = false;
          let anyBrandVisible = false;  // brand name appears in AI text
          let anyResults = false;

          for (const engine of engines) {
            const aiOverview = await fetchForEngine(engine, query.queryText, {
              region: workspace.region || "us",
              language: workspace.language || "en",
            });
            const fetchedAt = new Date();

            if (!aiOverview) {
              continue;
            }

            anyResults = true;

            // Domain analysis
            const domainMentions = findDomainMentions(
              aiOverview.sources,
              domain
            );
            const isBrandMentioned = domainMentions.length > 0;
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

            if (isBrandMentioned) {
              anyBrandMentioned = true;
            }
            if (brandTextVisibility > 0) {
              anyBrandVisible = true;
            }

            // Competitor analysis
            const competitorMentionMap = findMultiDomainMentions(
              aiOverview.sources,
              competitorDomains
            );

            // Save results
            if (aiOverview.sources.length > 0) {
              const docs = aiOverview.sources.map((source, idx) => {
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

                return {
                  queryId: query._id,
                  tenantId: query.tenantId,
                  contentSnippet:
                    source.snippet ||
                    aiOverview.overviewText.substring(0, 500),
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
                    cronFetch: true,
                  },
                  fetchedAt,
                };
              });
              await TrackingResult.insertMany(docs);
            } else {
              await TrackingResult.create({
                queryId: query._id,
                tenantId: query.tenantId,
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
                  cronFetch: true,
                },
                fetchedAt,
              });
            }
          }

          const fetchedAt = new Date();
          await Query.updateOne(
            { _id: query._id },
            { lastFetchedAt: fetchedAt }
          );

          if (!anyResults) {
            results.noOverview++;
            results.processed++;
            return;
          }

          if (anyBrandMentioned) {
            results.brandMentions++;
          }

          // Pusher real-time push
          await triggerEvent(query.tenantId.toString(), "query:fetched", {
            queryId: query._id.toString(),
            queryText: query.queryText,
            isBrandMentioned: anyBrandMentioned,
            fetchedAt: fetchedAt.toISOString(),
          });

          // Alert: detect brand mention/drop changes
          const previousResult = await TrackingResult.findOne({
            queryId: query._id,
            fetchedAt: { $lt: fetchedAt },
          })
            .sort({ fetchedAt: -1 })
            .lean();

          const previouslyMentioned = ((previousResult?.brandTextVisibility as number) || 0) > 0;
          const change = detectBrandChange(previouslyMentioned, anyBrandVisible);

          if (change === "mentioned") {
            await createNotification({
              tenantId: query.tenantId.toString(),
              type: "brand_mentioned",
              title: `Brand mentioned in AI Overview`,
              message: `Your domain "${domain}" was mentioned in the AI Overview for "${query.queryText}".`,
              metadata: { queryId: query._id.toString(), queryText: query.queryText },
            });
          } else if (change === "dropped") {
            await createNotification({
              tenantId: query.tenantId.toString(),
              type: "brand_dropped",
              title: `Brand dropped from AI Overview`,
              message: `Your domain "${domain}" is no longer mentioned in the AI Overview for "${query.queryText}".`,
              metadata: { queryId: query._id.toString(), queryText: query.queryText },
            });
          }

          results.succeeded++;
          results.processed++;
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : "Unknown error";
          results.errors.push(`Query "${query.queryText}": ${msg}`);
          results.failed++;
          results.processed++;
        }
      });

      await Promise.all(batchPromises);

      // Delay between batches to avoid rate limits
      if (i + CONCURRENCY < queries.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
      }
    }

    return NextResponse.json({
      message: `Cron fetch complete: ${results.succeeded}/${queries.length} succeeded`,
      totalQueries: queries.length,
      ...results,
    });
  } catch (error) {
    console.error("Cron fetch-all error:", error);
    return NextResponse.json(
      { error: "Cron fetch failed" },
      { status: 500 }
    );
  }
}

/**
 * GET handler — Vercel Cron Jobs send GET requests by default.
 * Delegate to POST logic.
 */
export async function GET(req: Request) {
  return POST(req);
}
