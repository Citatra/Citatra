import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Query from "@/models/Query";
import Membership from "@/models/Membership";
import { triggerBackgroundFetch } from "@/lib/query-fetcher";

export const runtime = "nodejs";

/**
 * POST /api/workspaces/[workspaceId]/queries/bulk
 *
 * Bulk-create queries from CSV data. Accepts an array of query objects.
 * Deduplicates against existing queries.
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
    if (membership.role === "viewer") {
      return NextResponse.json(
        { error: "Viewers cannot create queries" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { queries: queryItems } = body as {
      queries: {
        queryText: string;
        searchVolume?: number;
        engines?: string[];
        topic?: string;
        tags?: string[];
        location?: string;
      }[];
    };

    if (!Array.isArray(queryItems) || queryItems.length === 0) {
      return NextResponse.json(
        { error: "queries array is required" },
        { status: 400 }
      );
    }

    // Get existing query texts for dedup
    const existingQueries = await Query.find({
      tenantId: workspaceId,
      status: { $ne: "archived" },
    })
      .select("queryText")
      .lean();
    const existingTexts = new Set(
      existingQueries.map((q) => q.queryText.toLowerCase().trim())
    );

    const validEngines = ["google_ai_overview", "bing_chat", "perplexity", "chatgpt"];

    const toCreate: {
      tenantId: string;
      queryText: string;
      status: string;
      engines: string[];
      searchVolume: number;
      topic: string;
      tags: string[];
      location: string;
      promptVolume: number;
      createdBy: string;
    }[] = [];
    const skipped: string[] = [];

    for (const item of queryItems) {
      const text = (item.queryText || "").trim();
      if (!text) continue;

      if (existingTexts.has(text.toLowerCase())) {
        skipped.push(text);
        continue;
      }

      // Prevent duplicates within the import itself
      existingTexts.add(text.toLowerCase());

      const engines = Array.isArray(item.engines)
        ? item.engines.filter((e: string) => validEngines.includes(e))
        : ["google_ai_overview"];

      toCreate.push({
        tenantId: workspaceId,
        queryText: text,
        status: "active",
        engines: engines.length > 0 ? engines : ["google_ai_overview"],
        searchVolume: Number(item.searchVolume) || 0,
        topic: typeof item.topic === "string" ? item.topic.trim() : "",
        tags: Array.isArray(item.tags) ? item.tags.map((t: string) => String(t).trim()).filter(Boolean) : [],
        location: typeof item.location === "string" && item.location.trim() ? item.location.trim().toLowerCase() : "us",
        promptVolume: 3,
        createdBy: session.user.id,
      });
    }

    let created = 0;
    const createdIds: string[] = [];
    if (toCreate.length > 0) {
      const result = await Query.insertMany(toCreate);
      created = result.length;
      // Fire-and-forget: trigger initial AI Overview fetch for each
      for (const doc of result) {
        const id = doc._id.toString();
        createdIds.push(id);
        triggerBackgroundFetch(workspaceId, id);
      }
    }

    return NextResponse.json({
      message: `Imported ${created} queries, skipped ${skipped.length} duplicates`,
      created,
      createdIds,
      skipped: skipped.length,
      skippedQueries: skipped.slice(0, 20), // cap for response size
    });
  } catch (error) {
    console.error("Bulk query import error:", error);
    return NextResponse.json(
      { error: "Failed to import queries" },
      { status: 500 }
    );
  }
}
