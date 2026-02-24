import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";
import Membership from "@/models/Membership";
import Competitor from "@/models/Competitor";
import Workspace from "@/models/Workspace";
import PageAnalysis from "@/models/PageAnalysis";

export const runtime = "nodejs";

interface Recommendation {
  id: string;
  type: "opportunity" | "warning" | "improvement" | "info";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  queryText?: string;
  queryId?: string;
}

/**
 * GET /api/workspaces/[workspaceId]/recommendations
 *
 * Automated recommendations based on tracking data analysis.
 */
export async function GET(
  _req: Request,
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

    const workspace = await Workspace.findById(workspaceId).lean() as Record<string, unknown> | null;
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const domain = (workspace.domain as string) || "";

    const recommendations: Recommendation[] = [];
    let recIdx = 0;

    // 1. Find queries where brand is NEVER mentioned but competitors ARE
    const activeQueries = await Query.find({
      tenantId: workspaceId,
      status: "active",
    }).lean();

    for (const q of activeQueries) {
      const queryId = (q as unknown as Record<string, unknown>)._id as string;
      const queryText = (q as unknown as Record<string, unknown>).queryText as string;

      const brandResults = await TrackingResult.countDocuments({
        queryId,
        tenantId: workspaceId,
        brandTextVisibility: { $gt: 0 },
      });

      const competitorResults = await TrackingResult.countDocuments({
        queryId,
        tenantId: workspaceId,
        competitorDomain: { $exists: true, $ne: null },
      });

      if (brandResults === 0 && competitorResults > 0) {
        recommendations.push({
          id: `rec-${++recIdx}`,
          type: "warning",
          priority: "high",
          title: "Competitors cited but your brand is absent",
          description: `For "${queryText}", competitors appear in AI Overviews but your brand does not. Create or optimize content targeting this query to gain visibility.`,
          queryText,
          queryId: String(queryId),
        });
      }
    }

    // 2. Queries with zero AI Overview results
    for (const q of activeQueries) {
      const queryId = (q as unknown as Record<string, unknown>)._id as string;
      const queryText = (q as unknown as Record<string, unknown>).queryText as string;

      const totalResults = await TrackingResult.countDocuments({
        queryId,
        tenantId: workspaceId,
      });

      if (totalResults === 0) {
        recommendations.push({
          id: `rec-${++recIdx}`,
          type: "info",
          priority: "medium",
          title: "No AI Overview data yet",
          description: `"${queryText}" has no tracked results. This may mean AI Overviews don't appear for this query yet, or it hasn't been fetched. Consider running a manual fetch.`,
          queryText,
          queryId: String(queryId),
        });
      }
    }

    // 3. Brand mentioned but only with "brief" mention type — room for improvement
    for (const q of activeQueries) {
      const queryId = (q as unknown as Record<string, unknown>)._id as string;
      const queryText = (q as unknown as Record<string, unknown>).queryText as string;

      const briefMentions = await TrackingResult.countDocuments({
        queryId,
        tenantId: workspaceId,
        brandTextVisibility: { $gt: 0 },
        mentionType: "brief",
      });

      const detailedMentions = await TrackingResult.countDocuments({
        queryId,
        tenantId: workspaceId,
        brandTextVisibility: { $gt: 0 },
        mentionType: { $in: ["detailed", "featured"] },
      });

      if (briefMentions > 0 && detailedMentions === 0) {
        recommendations.push({
          id: `rec-${++recIdx}`,
          type: "improvement",
          priority: "medium",
          title: "Upgrade from brief to detailed citation",
          description: `Your brand appears briefly in AI Overviews for "${queryText}" but never as a detailed or featured source. Enhance your content depth and authority to earn a more prominent citation.`,
          queryText,
          queryId: String(queryId),
        });
      }
    }

    // 4. Negative sentiment detected
    for (const q of activeQueries) {
      const queryId = (q as unknown as Record<string, unknown>)._id as string;
      const queryText = (q as unknown as Record<string, unknown>).queryText as string;

      const negativeMentions = await TrackingResult.countDocuments({
        queryId,
        tenantId: workspaceId,
        brandTextVisibility: { $gt: 0 },
        sentiment: "negative",
      });

      if (negativeMentions > 0) {
        recommendations.push({
          id: `rec-${++recIdx}`,
          type: "warning",
          priority: "high",
          title: "Negative sentiment detected",
          description: `Your brand has ${negativeMentions} negative citation(s) for "${queryText}". Review the content being cited and address any reputation issues.`,
          queryText,
          queryId: String(queryId),
        });
      }
    }

    // 5. Low source position — brand cited but never in top 3
    for (const q of activeQueries) {
      const queryId = (q as unknown as Record<string, unknown>)._id as string;
      const queryText = (q as unknown as Record<string, unknown>).queryText as string;

      const brandResults = await TrackingResult.find({
        queryId,
        tenantId: workspaceId,
        isBrandMentioned: true,
        sourcePosition: { $gt: 0 },
      })
        .sort({ fetchedAt: -1 })
        .limit(5)
        .lean();

      if (brandResults.length > 0) {
        const avgPosition =
          brandResults.reduce((sum, r) => sum + ((r as unknown as Record<string, unknown>).sourcePosition as number || 0), 0) /
          brandResults.length;

        if (avgPosition > 3) {
          recommendations.push({
            id: `rec-${++recIdx}`,
            type: "improvement",
            priority: "medium",
            title: "Low citation position",
            description: `Your brand's average source position for "${queryText}" is ${avgPosition.toFixed(1)} (lower is better). Strengthen topical authority and content structure to move up.`,
            queryText,
            queryId: String(queryId),
          });
        }
      }
    }

    // 6. General advice if no competitors are configured
    const competitorCount = await Competitor.countDocuments({
      tenantId: workspaceId,
    });

    if (competitorCount === 0) {
      recommendations.push({
        id: `rec-${++recIdx}`,
        type: "info",
        priority: "low",
        title: "Add competitors for benchmarking",
        description: `You haven't added any competitors yet. Adding competitor domains enables Share of Voice comparison and helps identify content gaps.`,
      });
    }

    // 7. Few queries tracked
    if (activeQueries.length < 5) {
      recommendations.push({
        id: `rec-${++recIdx}`,
        type: "info",
        priority: "low",
        title: "Track more queries for better insights",
        description: `You're tracking only ${activeQueries.length} active quer${activeQueries.length === 1 ? "y" : "ies"}. Adding more queries gives a broader picture of your AI Overview visibility.`,
      });
    }

    // 8. Domain not configured
    if (!domain) {
      recommendations.push({
        id: `rec-${++recIdx}`,
        type: "warning",
        priority: "high",
        title: "Set your brand domain",
        description:
          "Your workspace doesn't have a domain configured. Brand mention detection won't work without it. Go to Settings → Workspace to add your domain.",
      });
    }

    // 9. Add HTML Audit issues
    const htmlAudits = await PageAnalysis.find({
      workspaceId,
      analysisType: "html-audit",
      status: "success",
    })
      .sort({ analyzedAt: -1 })
      .limit(10)
      .lean();

    for (const audit of htmlAudits) {
      const result = (audit.result as Record<string, unknown>) || {};
      const issues = (result.issues as Array<Record<string, unknown>>) || [];

      for (const issue of issues) {
        const severity = issue.severity as string;
        const message = issue.message as string;
        const url = audit.url;

        if (severity === "error") {
          recommendations.push({
            id: `rec-${++recIdx}`,
            type: "warning",
            priority: "high",
            title: `HTML audit error: ${message}`,
            description: `URL: ${url}. Fix this HTML/semantic issue to improve accessibility and SEO.`,
          });
        } else if (severity === "warning") {
          recommendations.push({
            id: `rec-${++recIdx}`,
            type: "improvement",
            priority: "medium",
            title: `HTML audit warning: ${message}`,
            description: `URL: ${url}. Address this warning to improve content structure.`,
          });
        }
      }
    }

    // 10. Add Geo Audit issues
    const geoAudits = await PageAnalysis.find({
      workspaceId,
      analysisType: "geo-audit",
      status: "success",
    })
      .sort({ analyzedAt: -1 })
      .limit(10)
      .lean();

    for (const audit of geoAudits) {
      const result = (audit.result as Record<string, unknown>) || {};
      const issues = (result.issues as Array<Record<string, unknown>>) || [];

      for (const issue of issues) {
        const severity = issue.severity as string;
        const message = issue.message as string;
        const url = audit.url;

        if (severity === "error") {
          recommendations.push({
            id: `rec-${++recIdx}`,
            type: "warning",
            priority: "high",
            title: `Geo audit error: ${message}`,
            description: `URL: ${url}. Fix this international SEO issue to improve regional visibility.`,
          });
        } else if (severity === "warning") {
          recommendations.push({
            id: `rec-${++recIdx}`,
            type: "improvement",
            priority: "medium",
            title: `Geo audit warning: ${message}`,
            description: `URL: ${url}. Address this geo-targeting issue.`,
          });
        }
      }
    }

    // 11. Add Semantic Map optimization suggestions
    const semanticMaps = await PageAnalysis.find({
      workspaceId,
      analysisType: "semantic-map",
      status: "success",
    })
      .sort({ analyzedAt: -1 })
      .limit(10)
      .lean();

    for (const map of semanticMaps) {
      const result = (map.result as Record<string, unknown>) || {};
      const suggestions = (result.suggestions as string[]) || [];

      for (const suggestion of suggestions) {
        recommendations.push({
          id: `rec-${++recIdx}`,
          type: "opportunity",
          priority: "medium",
          title: "Content improvement suggestion",
          description: `${suggestion} (from: ${map.url})`,
        });
      }
    }

    // Sort: high first, then medium, then low
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("Recommendations error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
