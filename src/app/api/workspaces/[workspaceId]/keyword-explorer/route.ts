import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";

export const runtime = "nodejs";

interface Opportunity {
  keyword: string;
  type: "gap" | "expansion" | "trending" | "long-tail";
  source: string;
  relevanceScore: number;
  currentVisibility: number;
  potentialImpact: "high" | "medium" | "low";
  suggestion: string;
}

/**
 * GET /api/workspaces/[workspaceId]/keyword-explorer
 *
 * Keyword & Semantic Opportunity Explorer —
 * Analyzes tracked queries and AI overview results to find keyword gaps,
 * semantic expansions, and content opportunities.
 */
export async function GET(
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

    // Get workspace queries
    const queries = (await Query.find({ tenantId: workspaceId }).lean()) as unknown as Array<
      Record<string, unknown>
    >;

    // Get recent tracking results
    const results = (await TrackingResult.find({ tenantId: workspaceId })
      .sort({ fetchedAt: -1 })
      .limit(500)
      .lean()) as unknown as Array<Record<string, unknown>>;

    const opportunities: Opportunity[] = [];
    const queryTexts = queries.map((q) => (q.queryText as string) || "");

    // 1. Extract related terms from AI overview content
    const contentTerms = new Map<string, number>();
    for (const r of results) {
      const text = ((r.overviewText as string) || "") + " " + ((r.contentSnippet as string) || "");
      const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 4);

      for (const word of words) {
        contentTerms.set(word, (contentTerms.get(word) || 0) + 1);
      }
    }

    // Extract 2-3 word phrases (bigrams/trigrams)
    for (const r of results) {
      const text = ((r.overviewText as string) || "").toLowerCase();
      const words = text.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length - 1; i++) {
        if (words[i].length > 3 && words[i + 1].length > 3) {
          const bigram = `${words[i]} ${words[i + 1]}`;
          contentTerms.set(bigram, (contentTerms.get(bigram) || 0) + 1);
        }
      }
    }

    // Stop words to filter
    const stopWords = new Set([
      "about", "after", "again", "being", "could", "every", "first",
      "found", "great", "their", "there", "these", "thing", "think",
      "those", "through", "would", "which", "where", "while", "other",
      "should", "under", "using", "before", "between", "during", "without",
    ]);

    // 2. Identify semantic expansion opportunities
    const sortedTerms = Array.from(contentTerms.entries())
      .filter(
        ([term, count]) =>
          count >= 3 &&
          !stopWords.has(term) &&
          !queryTexts.some((q) => q.toLowerCase().includes(term))
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    for (const [term, count] of sortedTerms) {
      const isPhrase = term.includes(" ");
      opportunities.push({
        keyword: term,
        type: isPhrase ? "long-tail" : "expansion",
        source: "AI Overview content analysis",
        relevanceScore: Math.min(100, count * 10),
        currentVisibility: 0,
        potentialImpact: count > 10 ? "high" : count > 5 ? "medium" : "low",
        suggestion: isPhrase
          ? `Create content targeting "${term}" — appears ${count} times in AI overviews for your tracked queries.`
          : `Incorporate "${term}" into your content strategy — frequently mentioned in AI overviews.`,
      });
    }

    // 3. Identify gaps — queries with low visibility
    const queryVisibility = new Map<string, { total: number; branded: number }>();
    for (const r of results) {
      const qId = String(r.queryId);
      const prev = queryVisibility.get(qId) || { total: 0, branded: 0 };
      prev.total += 1;
      if (r.isBrandMentioned) prev.branded += 1;
      queryVisibility.set(qId, prev);
    }

    for (const q of queries) {
      const qId = String(q._id);
      const vis = queryVisibility.get(qId);
      if (!vis || vis.branded === 0) {
        opportunities.push({
          keyword: (q.queryText as string) || "",
          type: "gap",
          source: "Tracked query with no brand mentions",
          relevanceScore: 90,
          currentVisibility: 0,
          potentialImpact: "high",
          suggestion: `Your brand is not appearing in AI overviews for "${q.queryText}". Focus on creating authoritative content for this topic.`,
        });
      } else if (vis.total > 0 && vis.branded / vis.total < 0.3) {
        const pct = Math.round((vis.branded / vis.total) * 100);
        opportunities.push({
          keyword: (q.queryText as string) || "",
          type: "gap",
          source: "Low brand visibility",
          relevanceScore: 70,
          currentVisibility: pct,
          potentialImpact: "medium",
          suggestion: `Brand appears in only ${pct}% of AI overviews for "${q.queryText}". Strengthen topical authority.`,
        });
      }
    }

    // 4. Find trending patterns — queries whose recent visibility is better than earlier
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    const sixtyDaysAgo = now - 60 * 86400000;

    for (const q of queries) {
      const qId = String(q._id);
      const qResults = results.filter((r) => String(r.queryId) === qId);
      const recent = qResults.filter(
        (r) => new Date(r.fetchedAt as string).getTime() > thirtyDaysAgo
      );
      const older = qResults.filter(
        (r) => {
          const t = new Date(r.fetchedAt as string).getTime();
          return t > sixtyDaysAgo && t <= thirtyDaysAgo;
        }
      );

      if (recent.length > 0 && older.length > 0) {
        const recentRate = recent.filter((r) => r.isBrandMentioned).length / recent.length;
        const olderRate = older.filter((r) => r.isBrandMentioned).length / older.length;

        if (recentRate > olderRate + 0.2) {
          opportunities.push({
            keyword: (q.queryText as string) || "",
            type: "trending",
            source: "Growing visibility trend",
            relevanceScore: 80,
            currentVisibility: Math.round(recentRate * 100),
            potentialImpact: "high",
            suggestion: `Visibility for "${q.queryText}" is trending up (${Math.round(olderRate * 100)}% → ${Math.round(recentRate * 100)}%). Double down on this topic.`,
          });
        }
      }
    }

    // Sort by relevance score
    opportunities.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Summary
    const summary = {
      totalOpportunities: opportunities.length,
      gaps: opportunities.filter((o) => o.type === "gap").length,
      expansions: opportunities.filter((o) => o.type === "expansion").length,
      trending: opportunities.filter((o) => o.type === "trending").length,
      longTail: opportunities.filter((o) => o.type === "long-tail").length,
      highImpact: opportunities.filter((o) => o.potentialImpact === "high").length,
    };

    return NextResponse.json({ opportunities, summary });
  } catch (error) {
    console.error("Keyword explorer error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
