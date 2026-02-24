import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Workspace from "@/models/Workspace";
import Membership from "@/models/Membership";
import Query from "@/models/Query";
import Competitor from "@/models/Competitor";
import { triggerBackgroundFetch } from "@/lib/query-fetcher";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/onboarding
 *
 * Returns the fetch progress for onboarding queries.
 * Used by the completion screen to poll until all prompts have been fetched.
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
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const totalQueries = await Query.countDocuments({
      tenantId: workspaceId,
      status: "active",
    });

    const fetchedQueries = await Query.countDocuments({
      tenantId: workspaceId,
      status: "active",
      lastFetchedAt: { $ne: null },
    });

    const promptsComplete = totalQueries > 0 && fetchedQueries >= totalQueries;

    return NextResponse.json({
      totalQueries,
      fetchedQueries,
      promptsComplete,
      totalAnalyses: 0,
      completedAnalyses: 0,
      analysisComplete: true,
      complete: promptsComplete,
    });
  } catch (error) {
    console.error("Onboarding status error:", error);
    return NextResponse.json(
      { error: "Failed to check onboarding status" },
      { status: 500 }
    );
  }
}

const COMPETITOR_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

/**
 * POST /api/workspaces/[workspaceId]/onboarding
 *
 * Completes the onboarding flow:
 *  1. Sets domain on the workspace
 *  2. Creates Query documents from keywords (as active prompts)
 *  3. Creates Competitor documents from competitor domains
 *  4. Marks onboardingCompleted = true
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

    // Check membership
    const membership = await Membership.findOne({
      userId: session.user.id,
      workspaceId,
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { workspaceName, domain, brandNames, region, frequency, keywords, competitors } = await req.json();

    // --- 1. Update workspace settings ---
    const wsUpdates: Record<string, unknown> = {
      onboardingCompleted: true,
    };
    if (workspaceName && typeof workspaceName === "string" && workspaceName.trim()) {
      wsUpdates.name = workspaceName.trim();
      wsUpdates.slug = workspaceName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "workspace";
    }
    if (domain && typeof domain === "string" && domain.trim()) {
      wsUpdates.domain = domain.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "");
    }
    if (region && typeof region === "string") {
      wsUpdates.region = region.toLowerCase();
    }
    if (frequency && typeof frequency === "string") {
      wsUpdates.updateFrequency = frequency;
    }
    if (Array.isArray(brandNames)) {
      wsUpdates.brandNames = brandNames.filter((b: unknown) => typeof b === "string" && b.trim()).map((b: string) => b.trim());
    }
    if (Array.isArray(keywords) && keywords.length > 0) {
      wsUpdates.keywords = keywords.map((kw: string | { text: string }) =>
        typeof kw === "string" ? kw : kw.text
      );
    }

    await Workspace.findByIdAndUpdate(workspaceId, { $set: wsUpdates });

    // --- 2. Create Query documents from keywords ---
    let queriesCreated = 0;
    if (Array.isArray(keywords) && keywords.length > 0) {
      const existingQueries = await Query.find({ tenantId: workspaceId }).select("queryText");
      const existingTexts = new Set(existingQueries.map((q) => q.queryText.toLowerCase()));

      const queryLocation = (region && typeof region === "string") ? region.toLowerCase() : "us";

      const newQueries = keywords
        .map((kw: string | { text: string; volume?: number }) => {
          const text = typeof kw === "string" ? kw : kw.text;
          const volume = typeof kw === "object" && kw.volume ? kw.volume : undefined;
          return { text, volume };
        })
        .filter(({ text }) => text && !existingTexts.has(text.toLowerCase()))
        .map(({ text, volume }) => ({
          tenantId: workspaceId,
          queryText: text,
          status: "active" as const,
          engines: ["google_ai_overview"],
          location: queryLocation,
          tags: ["onboarding"],
          createdBy: session.user.id,
          ...(volume != null ? { promptVolume: volume } : {}),
        }));

      if (newQueries.length > 0) {
        const inserted = await Query.insertMany(newQueries, { ordered: false }).catch(() => []);
        queriesCreated = Array.isArray(inserted) ? inserted.length : 0;

        // Trigger immediate background fetch for each new query
        const createdQueries = await Query.find({
          tenantId: workspaceId,
          tags: "onboarding",
          status: "active",
        }).select("_id");
        for (const q of createdQueries) {
          triggerBackgroundFetch(workspaceId, q._id.toString());
        }
      }
    }

    // --- 3. Create Competitor documents from domains ---
    let competitorsCreated = 0;
    if (Array.isArray(competitors) && competitors.length > 0) {
      const existingCompetitors = await Competitor.find({ tenantId: workspaceId }).select("domain");
      const existingDomains = new Set(existingCompetitors.map((c) => c.domain.toLowerCase()));

      const newCompetitors = competitors
        .filter((domain: string) => domain && !existingDomains.has(domain.toLowerCase()))
        .map((domain: string, idx: number) => {
          const name = domain
            .replace(/^(www\.)?/, "")
            .replace(/\.[a-z]{2,}$/i, "")
            .replace(/[.-]/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase());

          return {
            tenantId: workspaceId,
            name,
            domain: domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, ""),
            alternativeNames: [],
            alternativeDomains: [],
            color: COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length],
            createdBy: session.user.id,
          };
        });

      if (newCompetitors.length > 0) {
        await Competitor.insertMany(newCompetitors, { ordered: false }).catch(() => {});
        competitorsCreated = newCompetitors.length;

        const allDomains = [...existingDomains, ...newCompetitors.map((c) => c.domain)];
        await Workspace.findByIdAndUpdate(workspaceId, {
          $set: { competitorDomains: [...new Set(allDomains)] },
        });
      }
    }

    const totalActiveQueries = await Query.countDocuments({
      tenantId: workspaceId,
      status: "active",
    });

    return NextResponse.json({
      success: true,
      queriesCreated,
      competitorsCreated,
      totalActiveQueries,
    });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: "Failed to complete onboarding" },
      { status: 500 }
    );
  }
}
