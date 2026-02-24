import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Query from "@/models/Query";
import Membership from "@/models/Membership";
import Workspace from "@/models/Workspace";

// Optional: install @google/generative-ai for Gemini-powered suggestions
// Falls back to template engine if not available or GEMINI_API_KEY not set
let GoogleGenerativeAI: typeof import("@google/generative-ai").GoogleGenerativeAI | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@google/generative-ai");
  GoogleGenerativeAI = mod.GoogleGenerativeAI;
} catch {
  // @google/generative-ai not installed — will use template fallback
}

export const runtime = "nodejs";

/**
 * POST /api/workspaces/[workspaceId]/prompts/suggest
 *
 * Generates AI prompt suggestions using Google Gemini, based on the
 * workspace's domain, keywords, existing prompts, and optional topic focus.
 * Falls back to a template engine if Gemini API key is unavailable.
 *
 * Body: { topic?: string, count?: number }
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

    const workspace = await Workspace.findById(workspaceId).lean();
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const ws = workspace as unknown as Record<string, unknown>;
    const domain = (ws.domain as string) || "";
    const keywords = (ws.keywords as string[]) || [];

    const body = await req.json();
    const { topic: topicFocus, count: rawCount } = body;
    const count = Math.min(Math.max(Number(rawCount) || 5, 1), 20);

    // Get existing prompts to avoid duplicates
    const existingPrompts = await Query.find({
      tenantId: workspaceId,
      status: { $in: ["active", "inactive", "suggested"] },
    })
      .select("queryText topic tags")
      .lean();

    const existingTexts = existingPrompts.map((p) => p.queryText.toLowerCase().trim());
    const existingTopics = [...new Set(existingPrompts.map((p) => p.topic).filter(Boolean))];

    // Extract brand name from domain
    const brandName = domain
      ? domain.replace(/^www\./, "").split(".")[0]
      : "our product";
    const capitalBrand = brandName.charAt(0).toUpperCase() + brandName.slice(1);

    // Try Gemini first, fall back to template engine
    let suggestions: SuggestionOutput[];

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey && GoogleGenerativeAI) {
      suggestions = await generateWithGemini({
        apiKey: geminiApiKey,
        brandName: capitalBrand,
        domain,
        keywords,
        existingTexts,
        existingTopics: existingTopics as string[],
        topicFocus,
        count,
      });
    } else {
      suggestions = generateWithTemplates({
        brandName: capitalBrand,
        keywords,
        existingTexts,
        existingTopics: existingTopics as string[],
        topicFocus,
        count,
      });
    }

    // Filter out exact duplicates
    const filtered = suggestions.filter(
      (s) => !existingTexts.includes(s.queryText.toLowerCase().trim())
    );

    // Save as "suggested" status
    const created = [];
    for (const suggestion of filtered) {
      const query = await Query.create({
        tenantId: workspaceId,
        queryText: suggestion.queryText,
        status: "suggested",
        engines: ["google_ai_overview"],
        topic: suggestion.topic,
        tags: suggestion.tags,
        location: (ws.region as string) || "us",
        promptVolume: suggestion.volume,
        suggestedAt: new Date(),
        createdBy: session.user.id,
      });

      created.push({
        id: query._id.toString(),
        queryText: query.queryText,
        status: query.status,
        topic: query.topic || "",
        tags: query.tags || [],
        location: query.location || "us",
        promptVolume: query.promptVolume,
        suggestedAt: query.suggestedAt,
        createdAt: query.createdAt,
      });
    }

    return NextResponse.json({
      suggestions: created,
      generated: suggestions.length,
      saved: created.length,
      duplicatesSkipped: suggestions.length - created.length,
      engine: geminiApiKey ? "gemini" : "template",
    });
  } catch (error) {
    console.error("Prompt suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}

// ---- Types ----

interface SuggestionOutput {
  queryText: string;
  topic: string;
  tags: string[];
  volume: number;
}

// ---- Gemini-powered Suggestion Engine ----

async function generateWithGemini(input: {
  apiKey: string;
  brandName: string;
  domain: string;
  keywords: string[];
  existingTexts: string[];
  existingTopics: string[];
  topicFocus: string;
  count: number;
}): Promise<SuggestionOutput[]> {
  const { apiKey, brandName, domain, keywords, existingTexts, existingTopics, topicFocus, count } = input;

  if (!GoogleGenerativeAI) {
    return generateWithTemplates({ brandName, keywords, existingTexts, existingTopics, topicFocus, count });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const existingSample = existingTexts.slice(0, 10).join("\n- ");

  const prompt = `You are an AI visibility monitoring expert. Generate exactly ${count} unique search prompts that real users would ask AI assistants (like Google AI Overview, ChatGPT, Perplexity) when looking for products or services related to the following brand.

Brand: ${brandName}
${domain ? `Website: ${domain}` : ""}
${keywords.length > 0 ? `Keywords/Topics: ${keywords.join(", ")}` : ""}
${topicFocus ? `Focus Topic: ${topicFocus}` : ""}
${existingSample ? `\nExisting prompts (do NOT duplicate these):\n- ${existingSample}` : ""}
${existingTopics.length > 0 ? `\nExisting topics: ${existingTopics.join(", ")}` : ""}

Requirements:
- Each prompt must be a natural, conversational question (50-200 characters)
- Mix different intent types: recommendation, comparison, informational, use-case, problem-solving, and brand-specific
- Include prompts where users might discover or compare the brand
- Each prompt should have a topic (category/group), relevant tags, and a volume score (1-5, where 5 = highest estimated demand)
- Do NOT repeat any existing prompts listed above

Return ONLY a valid JSON array with this exact structure, no markdown or extra text:
[{"queryText": "...", "topic": "...", "tags": ["tag1", "tag2"], "volume": 3}]`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Gemini did not return valid JSON array, falling back to templates");
      return generateWithTemplates({
        brandName,
        keywords,
        existingTexts,
        existingTopics,
        topicFocus,
        count,
      });
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      queryText?: string;
      topic?: string;
      tags?: string[];
      volume?: number;
    }>;

    return parsed
      .filter((item) => item.queryText && typeof item.queryText === "string" && item.queryText.length <= 200)
      .slice(0, count)
      .map((item) => ({
        queryText: item.queryText!.trim(),
        topic: (item.topic || topicFocus || "General").trim(),
        tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 5) : ["general"],
        volume: Math.min(5, Math.max(1, Math.round(Number(item.volume) || 3))),
      }));
  } catch (error) {
    console.error("Gemini API error, falling back to template engine:", error);
    return generateWithTemplates({
      brandName,
      keywords,
      existingTexts,
      existingTopics,
      topicFocus,
      count,
    });
  }
}

// ---- Template-based Fallback Engine ----

function generateWithTemplates(input: {
  brandName: string;
  keywords: string[];
  existingTexts: string[];
  existingTopics: string[];
  topicFocus: string;
  count: number;
}): SuggestionOutput[] {
  const { brandName, keywords, existingTopics, topicFocus, count } = input;

  const intentTemplates = [
    `What is the best {keyword} for {context}?`,
    `Which {keyword} would you recommend for {context}?`,
    `What are the top {keyword} options in {year}?`,
    `Can you compare the best {keyword} tools available today?`,
    `How does ${brandName} compare to competitors for {keyword}?`,
    `What are the pros and cons of different {keyword} solutions?`,
    `Which {keyword} platform is best for {context}?`,
    `How do I choose the right {keyword} for my business?`,
    `What should I look for in a {keyword} solution?`,
    `What are the most important features in a {keyword} tool?`,
    `What {keyword} works best for small businesses?`,
    `Which {keyword} is best for enterprise teams?`,
    `What {keyword} do startups typically use?`,
    `Is ${brandName} good for {keyword}?`,
    `What do people say about ${brandName} for {keyword}?`,
    `How does ${brandName} handle {keyword}?`,
    `How to improve {keyword} for my website?`,
    `What tools help with {keyword} optimization?`,
    `Best practices for {keyword} in {year}?`,
  ];

  const contexts = [
    "small businesses", "enterprise companies", "startups", "remote teams",
    "agencies", "e-commerce stores", "SaaS companies", "content creators",
    "marketing teams", "beginners",
  ];

  const year = new Date().getFullYear().toString();
  const results: SuggestionOutput[] = [];
  const usedTexts = new Set(input.existingTexts);
  const seeds = keywords.length > 0 ? keywords : [brandName, "software", "tool"];
  const topic = topicFocus || (existingTopics.length > 0 ? existingTopics[0] : "General");

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const shuffledTemplates = shuffle(intentTemplates);
  const shuffledContexts = shuffle(contexts);
  const shuffledSeeds = shuffle(seeds);

  let templateIdx = 0;
  let contextIdx = 0;
  let seedIdx = 0;

  while (results.length < count && templateIdx < shuffledTemplates.length * 2) {
    const template = shuffledTemplates[templateIdx % shuffledTemplates.length];
    const keyword = shuffledSeeds[seedIdx % shuffledSeeds.length];
    const context = shuffledContexts[contextIdx % shuffledContexts.length];

    const prompt = template
      .replace(/\{keyword\}/g, keyword)
      .replace(/\{context\}/g, context)
      .replace(/\{year\}/g, year);

    const normalized = prompt.toLowerCase().trim();

    if (!usedTexts.has(normalized) && prompt.length <= 200) {
      usedTexts.add(normalized);

      const volume = Math.min(5, Math.max(1,
        Math.ceil(Math.random() * 3) + (keywords.includes(keyword) ? 1 : 0)
      ));

      const tags: string[] = [];
      if (prompt.includes("compare") || prompt.includes("pros and cons")) tags.push("comparison");
      if (prompt.includes("best") || prompt.includes("recommend")) tags.push("recommendation");
      if (prompt.includes(brandName) || prompt.includes(brandName.toLowerCase())) tags.push("brand");
      if (prompt.includes("how") || prompt.includes("what should")) tags.push("informational");
      if (prompt.includes("enterprise") || prompt.includes("startup") || prompt.includes("small business")) tags.push("audience-specific");

      results.push({
        queryText: prompt,
        topic,
        tags: tags.length > 0 ? tags : ["general"],
        volume,
      });
    }

    templateIdx++;
    contextIdx++;
    seedIdx++;
  }

  return results.slice(0, count);
}
