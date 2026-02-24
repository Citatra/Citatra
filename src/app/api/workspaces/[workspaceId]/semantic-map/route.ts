import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";

export const runtime = "nodejs";

interface Entity {
  name: string;
  type: string;
  salience: number;
  mentions: number;
}

interface TopicCluster {
  topic: string;
  entities: Entity[];
  coverage: "strong" | "moderate" | "weak" | "missing";
  suggestion: string;
}

/**
 * POST /api/workspaces/[workspaceId]/semantic-map
 *
 * Analyzes a URL or text content to extract entities and topics,
 * maps relationships, and generates optimization suggestions.
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

    const body = await req.json();
    const { url, content, targetKeywords } = body as {
      url?: string;
      content?: string;
      targetKeywords?: string[];
    };

    if (!url && !content) {
      return NextResponse.json(
        { error: "url or content is required" },
        { status: 400 }
      );
    }

    // Fetch page content if URL provided
    let textContent = content || "";
    let pageTitle = "";
    if (url) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Citatra-Bot/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        const html = await res.text();
        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        pageTitle = titleMatch?.[1]?.trim() || "";
        // Strip HTML tags for text analysis
        textContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 15000);
      } catch {
        return NextResponse.json(
          { error: "Failed to fetch the URL" },
          { status: 400 }
        );
      }
    }

    // Extract entities using pattern-based NER
    const entities = extractEntities(textContent);

    // Build topic clusters
    const topics = buildTopicClusters(
      entities,
      textContent,
      targetKeywords || []
    );

    // Generate optimization suggestions
    const suggestions = generateSuggestions(topics, entities, targetKeywords || []);

    // Compute entity-relationship graph edges
    const relationships = buildRelationships(entities, textContent);

    return NextResponse.json({
      url: url || null,
      pageTitle,
      contentLength: textContent.length,
      entities: entities.slice(0, 50),
      topics,
      relationships: relationships.slice(0, 30),
      suggestions,
      summary: {
        totalEntities: entities.length,
        topicsCovered: topics.filter((t) => t.coverage !== "missing").length,
        topicsMissing: topics.filter((t) => t.coverage === "missing").length,
        suggestionsCount: suggestions.length,
      },
    });
  } catch (error) {
    console.error("Semantic map error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function extractEntities(text: string): Entity[] {
  const entityPatterns: { type: string; pattern: RegExp }[] = [
    { type: "Organization", pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}(?:\s+(?:Inc|Corp|LLC|Ltd|Co|Group|Foundation)\.?)\b/g },
    { type: "Product", pattern: /\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\s+(?:Pro|Plus|Premium|Enterprise|Suite|Platform|API|SDK|Tool)\b/g },
    { type: "Technology", pattern: /\b(?:AI|ML|NLP|API|REST|GraphQL|JavaScript|TypeScript|Python|React|Next\.js|Node\.js|MongoDB|PostgreSQL|Docker|Kubernetes|AWS|GCP|Azure|SEO|LLM|GPT|Claude|Gemini|BERT|Transformer)\b/gi },
    { type: "Concept", pattern: /\b(?:machine learning|artificial intelligence|deep learning|natural language processing|search engine optimization|content marketing|digital marketing|structured data|schema markup|knowledge graph|semantic search|entity recognition|topic modeling|backlink|domain authority)\b/gi },
    { type: "Person", pattern: /(?:Dr\.|Mr\.|Ms\.|Prof\.)\s+[A-Z][a-z]+\s+[A-Z][a-z]+/g },
  ];

  const entityMap = new Map<string, Entity>();

  for (const { type, pattern } of entityPatterns) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      const normalized = match.trim();
      const key = normalized.toLowerCase();
      if (entityMap.has(key)) {
        entityMap.get(key)!.mentions++;
      } else {
        entityMap.set(key, {
          name: normalized,
          type,
          salience: 0,
          mentions: 1,
        });
      }
    }
  }

  // Also extract capitalized multi-word phrases as potential entities
  const capPattern = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,3})\b/g;
  const capMatches = text.match(capPattern) || [];
  for (const match of capMatches) {
    const key = match.toLowerCase();
    if (!entityMap.has(key)) {
      entityMap.set(key, {
        name: match,
        type: "Entity",
        salience: 0,
        mentions: 1,
      });
    } else {
      entityMap.get(key)!.mentions++;
    }
  }

  // Calculate salience based on mentions and position
  const entities = Array.from(entityMap.values());
  const maxMentions = Math.max(...entities.map((e) => e.mentions), 1);
  for (const e of entities) {
    e.salience = Math.round((e.mentions / maxMentions) * 100) / 100;
  }

  return entities
    .filter((e) => e.mentions >= 1)
    .sort((a, b) => b.salience - a.salience);
}

function buildTopicClusters(
  entities: Entity[],
  text: string,
  targetKeywords: string[]
): TopicCluster[] {
  const clusters: TopicCluster[] = [];
  const textLower = text.toLowerCase();

  // Group entities by type
  const typeGroups = new Map<string, Entity[]>();
  for (const e of entities) {
    const arr = typeGroups.get(e.type) || [];
    arr.push(e);
    typeGroups.set(e.type, arr);
  }

  for (const [type, ents] of typeGroups) {
    const topEnts = ents.slice(0, 5);
    const totalMentions = topEnts.reduce((s, e) => s + e.mentions, 0);
    const coverage =
      totalMentions > 10 ? "strong" : totalMentions > 3 ? "moderate" : "weak";

    clusters.push({
      topic: type,
      entities: topEnts,
      coverage,
      suggestion:
        coverage === "weak"
          ? `Add more content about ${type.toLowerCase()} entities to strengthen this topic area.`
          : coverage === "moderate"
            ? `Consider expanding ${type.toLowerCase()} coverage with additional context and detail.`
            : `Good coverage of ${type.toLowerCase()} topics. Maintain and update regularly.`,
    });
  }

  // Check target keywords
  for (const kw of targetKeywords) {
    const kwLower = kw.toLowerCase();
    const count = (textLower.match(new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
    if (count === 0) {
      clusters.push({
        topic: `Target: ${kw}`,
        entities: [],
        coverage: "missing",
        suggestion: `Your target keyword "${kw}" is not found in the content. Add a dedicated section covering this topic.`,
      });
    }
  }

  return clusters;
}

function generateSuggestions(
  topics: TopicCluster[],
  entities: Entity[],
  targetKeywords: string[]
): string[] {
  const suggestions: string[] = [];

  const weak = topics.filter((t) => t.coverage === "weak");
  const missing = topics.filter((t) => t.coverage === "missing");

  if (missing.length > 0) {
    suggestions.push(
      `${missing.length} target keyword(s) are missing from the content. Add dedicated sections for: ${missing.map((t) => t.topic.replace("Target: ", "")).join(", ")}.`
    );
  }

  if (weak.length > 0) {
    suggestions.push(
      `${weak.length} topic area(s) have weak coverage. Expand content about: ${weak.map((t) => t.topic).join(", ")}.`
    );
  }

  if (entities.length < 10) {
    suggestions.push(
      "Content has few identifiable entities. Add more specific names, products, and concepts to improve semantic richness."
    );
  }

  const techEntities = entities.filter((e) => e.type === "Technology");
  if (techEntities.length > 0) {
    suggestions.push(
      `Consider adding Schema.org markup for technologies mentioned: ${techEntities.slice(0, 5).map((e) => e.name).join(", ")}.`
    );
  }

  if (targetKeywords.length === 0) {
    suggestions.push(
      "Add target keywords to get more specific optimization recommendations."
    );
  }

  return suggestions;
}

function buildRelationships(
  entities: Entity[],
  text: string
): { source: string; target: string; strength: number }[] {
  const relationships: { source: string; target: string; strength: number }[] =
    [];
  const top = entities.slice(0, 20);

  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i].name;
      const b = top[j].name;
      // Check co-occurrence within ~200 chars
      const aIdx = text.indexOf(a);
      const bIdx = text.indexOf(b);
      if (aIdx >= 0 && bIdx >= 0 && Math.abs(aIdx - bIdx) < 500) {
        relationships.push({
          source: a,
          target: b,
          strength: Math.round(
            (1 / (1 + Math.abs(aIdx - bIdx) / 500)) * 100
          ) / 100,
        });
      }
    }
  }

  return relationships.sort((a, b) => b.strength - a.strength);
}
