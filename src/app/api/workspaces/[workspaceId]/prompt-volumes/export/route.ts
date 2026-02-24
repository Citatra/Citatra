import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import PromptVolume from "@/models/PromptVolume";
import Membership from "@/models/Membership";
import mongoose from "mongoose";

export const runtime = "nodejs";

// GET /api/workspaces/[workspaceId]/prompt-volumes/export
// Query params: format (csv|json), q, engine, region, intent, sentiment, from, to
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
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "csv";
    const q = url.searchParams.get("q") || "";
    const engine = url.searchParams.get("engine") || "";
    const region = url.searchParams.get("region") || "";
    const intent = url.searchParams.get("intent") || "";
    const sentiment = url.searchParams.get("sentiment") || "";
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";

    const filter: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(workspaceId),
    };

    if (q) {
      filter.$or = [
        { canonicalTopic: { $regex: q, $options: "i" } },
        { exemplarPrompts: { $regex: q, $options: "i" } },
      ];
    }
    if (engine) filter["engineBreakdown.engine"] = engine;
    if (region) filter["regionBreakdown.region"] = region;
    if (intent) filter.intent = intent;
    if (sentiment) filter.sentiment = sentiment;
    if (from || to) {
      filter.periodStart = {};
      if (from) (filter.periodStart as Record<string, Date>).$gte = new Date(from);
      if (to) (filter.periodStart as Record<string, Date>).$lte = new Date(to);
    }

    const topics = await PromptVolume.find(filter)
      .sort({ estimatedVolume: -1 })
      .limit(10000)
      .lean();

    if (format === "json") {
      const jsonData = topics.map((t) => ({
        canonicalTopic: t.canonicalTopic,
        estimatedVolume: t.estimatedVolume,
        volumeCILow: t.volumeCILow,
        volumeCIHigh: t.volumeCIHigh,
        confidence: t.confidence,
        intent: t.intent,
        sentiment: t.sentiment,
        provenance: t.provenance,
        observedFraction: t.observedFraction,
        syntheticFraction: t.syntheticFraction,
        weekOverWeekChange: t.weekOverWeekChange,
        trendDirection: t.trendDirection,
        isTrending: t.isTrending,
        engines: t.engineBreakdown?.map((e: { engine: string; volume: number }) => `${e.engine}:${e.volume}`).join(";"),
        regions: t.regionBreakdown?.map((r: { region: string; volume: number }) => `${r.region}:${r.volume}`).join(";"),
        tags: t.tags?.join(";"),
        exemplarPrompts: t.exemplarPrompts?.join("|"),
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
      }));

      return new NextResponse(JSON.stringify(jsonData, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="prompt-volumes-${workspaceId}.json"`,
        },
      });
    }

    // CSV format
    const csvHeaders = [
      "Canonical Topic",
      "Estimated Volume",
      "CI Low",
      "CI High",
      "Confidence",
      "Intent",
      "Sentiment",
      "Provenance",
      "Observed %",
      "Synthetic %",
      "WoW Change %",
      "Trend Direction",
      "Is Trending",
      "Engines",
      "Regions",
      "Tags",
      "Exemplar Prompts",
      "Period Start",
      "Period End",
    ];

    const csvRows = topics.map((t) =>
      [
        `"${(t.canonicalTopic || "").replace(/"/g, '""')}"`,
        t.estimatedVolume,
        t.volumeCILow,
        t.volumeCIHigh,
        t.confidence,
        t.intent,
        t.sentiment,
        t.provenance,
        Math.round((t.observedFraction || 0) * 100),
        Math.round((t.syntheticFraction || 0) * 100),
        t.weekOverWeekChange,
        t.trendDirection,
        t.isTrending ? "Yes" : "No",
        `"${(t.engineBreakdown || []).map((e: { engine: string; volume: number }) => `${e.engine}:${e.volume}`).join(";")}"`,
        `"${(t.regionBreakdown || []).map((r: { region: string; volume: number }) => `${r.region}:${r.volume}`).join(";")}"`,
        `"${(t.tags || []).join(";")}"`,
        `"${(t.exemplarPrompts || []).slice(0, 3).join("|").replace(/"/g, '""')}"`,
        t.periodStart ? new Date(t.periodStart).toISOString().split("T")[0] : "",
        t.periodEnd ? new Date(t.periodEnd).toISOString().split("T")[0] : "",
      ].join(",")
    );

    const csv = [csvHeaders.join(","), ...csvRows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="prompt-volumes-${workspaceId}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting prompt volumes:", error);
    return NextResponse.json(
      { error: "Failed to export prompt volumes" },
      { status: 500 }
    );
  }
}
