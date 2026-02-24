import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";
import Workspace from "@/models/Workspace";
import Membership from "@/models/Membership";
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
import { extractAndUpsertSources } from "@/lib/source-extractor";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ workspaceId: string; queryId: string }>;
};

/**
 * POST /api/workspaces/[workspaceId]/queries/[queryId]/fetch
 *
 * Trigger an on-demand fetch of the AI Overview for this query.
 * Calls Bright Data SERP API, parses the response, checks domain mentions,
 * and saves tracking results.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, queryId } = await params;
    await connectToDatabase();

    // Verify membership
    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });
    if (!membership || membership.role === "viewer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify SERP provider integrity
    verifySerpProviderIntegrity();

    // Get query
    const query = await Query.findOne({
      _id: queryId,
      tenantId: workspaceId,
    });
    if (!query) {
      return NextResponse.json({ error: "Query not found" }, { status: 404 });
    }

    // Get workspace (for domain matching)
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Load competitor domains
    const competitors = await Competitor.find({ tenantId: workspaceId }).lean();
    const competitorDomains = competitors.map((c) => c.domain);

    // Determine which engines to fetch
    const engines: EngineType[] =
      query.engines && query.engines.length > 0
        ? query.engines
        : ["google_ai_overview"];

    const domain = workspace.domain || "";
    const brandNames: string[] = workspace.brandNames || [];
    const fetchedAt = new Date();
    const savedResults: Array<Record<string, unknown>> = [];
    let anyBrandMentioned = false;

    // Fetch across all configured engines
    for (const engine of engines) {
      const aiOverview = await fetchForEngine(engine, query.queryText, {
        region: workspace.region || "us",
        language: workspace.language || "en",
      });

      if (!aiOverview) continue;

      // Check for brand domain mentions
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

      // Check for competitor domain mentions
      const competitorMentionMap = findMultiDomainMentions(
        aiOverview.sources,
        competitorDomains
      );

      // Extract and upsert into Sources collection
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

          // Determine which competitor domain (if any) this source belongs to
          let matchedCompetitorDomain = "";
          for (const [compDomain, compSources] of competitorMentionMap) {
            if (compSources.some((cs) => cs.link === source.link)) {
              matchedCompetitorDomain = compDomain;
              break;
            }
          }

          const result = await TrackingResult.create({
            queryId: query._id,
            tenantId: workspaceId,
            contentSnippet:
              source.snippet || aiOverview.overviewText.substring(0, 500) || "No content available",
            sourceUrl: source.link || "no-source",
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
            },
            fetchedAt,
          });
          savedResults.push({
            id: result._id.toString(),
            contentSnippet: result.contentSnippet,
            sourceUrl: result.sourceUrl,
            engine,
            isBrandMentioned: result.isBrandMentioned,
            competitorDomain: matchedCompetitorDomain,
            mentionType: result.mentionType,
            sentiment: result.sentiment,
            sourcePosition: idx + 1,
          });
        }
      } else {
        const result = await TrackingResult.create({
          queryId: query._id,
          tenantId: workspaceId,
          contentSnippet: aiOverview.overviewText.substring(0, 1000) || "No content available",
          sourceUrl: "no-source",
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
          },
          fetchedAt,
        });
        savedResults.push({
          id: result._id.toString(),
          contentSnippet: result.contentSnippet,
          sourceUrl: result.sourceUrl,
          engine,
          isBrandMentioned: false,
          mentionType: "none",
          sentiment: result.sentiment,
        });
      }
    }

    // Update query's lastFetchedAt
    await Query.updateOne({ _id: queryId }, { lastFetchedAt: fetchedAt });

    // ---- Pusher: push real-time update ----
    await triggerEvent(workspaceId, "query:fetched", {
      queryId: query._id.toString(),
      queryText: query.queryText,
      isBrandMentioned: anyBrandMentioned,
      engines,
      resultsCount: savedResults.length,
      fetchedAt: fetchedAt.toISOString(),
    });
    await triggerEvent(workspaceId, "stats:updated", {
      timestamp: fetchedAt.toISOString(),
    });

    // ---- Alerts: detect brand mention/drop changes ----
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
        title: `Brand mentioned in AI Overview`,
        message: `Your domain "${domain}" was mentioned in the AI Overview for "${query.queryText}".`,
        metadata: {
          queryId: query._id.toString(),
          queryText: query.queryText,
        },
      });
    } else if (change === "dropped") {
      await createNotification({
        tenantId: workspaceId,
        type: "brand_dropped",
        title: `Brand dropped from AI Overview`,
        message: `Your domain "${domain}" is no longer mentioned in the AI Overview for "${query.queryText}".`,
        metadata: {
          queryId: query._id.toString(),
          queryText: query.queryText,
        },
      });
    }

    return NextResponse.json({
      message: "AI Overview fetched successfully",
      query: {
        id: query._id.toString(),
        queryText: query.queryText,
        lastFetchedAt: fetchedAt,
      },
      engines,
      results: savedResults,
    });
  } catch (error) {
    console.error("Error fetching AI Overview:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch AI Overview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
