import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Workspace from "@/models/Workspace";
import { fetchForEngine, findDomainMentions, analyzeSentiment, verifySerpProviderIntegrity } from "@/lib/serp-api";
import type { EngineType } from "@/lib/serp-api";
import { extractAndUpsertSources } from "@/lib/source-extractor";
import Competitor from "@/models/Competitor";

export const runtime = "nodejs";

interface PlaygroundResult {
  engine: EngineType;
  label: string;
  overviewText: string;
  sources: { title: string; link: string; snippet?: string }[];
  brandMentioned: boolean;
  sentiment: string;
  responseTime: number;
}

/**
 * POST /api/workspaces/[workspaceId]/playground
 *
 * Real-Time Prompt Testing Playground: dispatches a prompt to multiple LLMs
 * in parallel and returns comparative results.
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

    // Verify SERP provider integrity
    verifySerpProviderIntegrity();

    const workspace = await Workspace.findById(workspaceId).lean();
    const domain = (workspace as unknown as Record<string, unknown>)?.domain as string || "";
    const region = (workspace as unknown as Record<string, unknown>)?.region as string || "us";
    const language = (workspace as unknown as Record<string, unknown>)?.language as string || "en";

    const competitors = await Competitor.find({ tenantId: workspaceId }).lean();
    const competitorDomains = competitors.map((c) => c.domain);

    const body = await req.json();
    const { prompt, engines } = body as {
      prompt: string;
      engines: EngineType[];
    };

    if (!prompt || !engines?.length) {
      return NextResponse.json(
        { error: "prompt and engines[] are required" },
        { status: 400 }
      );
    }

    const engineLabels: Record<string, string> = {
      google_ai_overview: "Google AI Overview",
      bing_chat: "Bing Copilot",
      perplexity: "Perplexity",
      chatgpt: "ChatGPT",
    };

    // Dispatch to all selected engines in parallel
    const results: PlaygroundResult[] = await Promise.all(
      engines.map(async (engine) => {
        const start = Date.now();
        try {
          const result = await fetchForEngine(engine, prompt, { region, language });
          const elapsed = Date.now() - start;

          if (!result) {
            return {
              engine,
              label: engineLabels[engine] || engine,
              overviewText: "",
              sources: [],
              brandMentioned: false,
              sentiment: "neutral",
              responseTime: elapsed,
            };
          }

          const mentions = domain
            ? findDomainMentions(result.sources, domain)
            : [];
          const brandMentioned = mentions.length > 0;
          const sentiment = brandMentioned
            ? analyzeSentiment(
                result.sources.find((s) =>
                  s.link?.toLowerCase().includes(domain.toLowerCase())
                )?.snippet || ""
              )
            : "neutral";

          // Upsert sources for the Sources analytics page
          const detectedBrands: string[] = [];
          if (domain && result.overviewText.toLowerCase().includes(domain.replace(/^www\./, "").split(".")[0])) {
            detectedBrands.push(domain);
          }
          for (const cd of competitorDomains) {
            if (result.overviewText.toLowerCase().includes(cd.replace(/^www\./, "").split(".")[0])) {
              detectedBrands.push(cd);
            }
          }
          await extractAndUpsertSources({
            tenantId: workspaceId,
            engine,
            sources: result.sources,
            mentionedBrands: detectedBrands,
          }).catch((err) => console.error("[Playground Sources] Extraction error:", err));

          return {
            engine,
            label: engineLabels[engine] || engine,
            overviewText: result.overviewText,
            sources: result.sources.map((s) => ({
              title: s.title,
              link: s.link,
              snippet: s.snippet,
            })),
            brandMentioned,
            sentiment,
            responseTime: elapsed,
          };
        } catch {
          return {
            engine,
            label: engineLabels[engine] || engine,
            overviewText: "",
            sources: [],
            brandMentioned: false,
            sentiment: "neutral",
            responseTime: Date.now() - start,
          };
        }
      })
    );

    // Compute comparative metrics
    const allTexts = results.map((r) => r.overviewText).filter(Boolean);
    const anyBrandMentioned = results.some((r) => r.brandMentioned);
    const avgResponseTime =
      results.reduce((s, r) => s + r.responseTime, 0) / results.length;

    return NextResponse.json({
      prompt,
      results,
      summary: {
        enginesQueried: results.length,
        enginesWithResults: allTexts.length,
        anyBrandMentioned,
        avgResponseTime: Math.round(avgResponseTime),
      },
    });
  } catch (error) {
    console.error("Playground error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
