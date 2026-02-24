import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Query from "@/models/Query";
import PromptVolume from "@/models/PromptVolume";
import Membership from "@/models/Membership";
import mongoose from "mongoose";

export const runtime = "nodejs";

function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(_req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
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

    // Load queries for this workspace
    const queries = await Query.find({ tenantId: workspaceId }).lean();
    if (!queries || queries.length === 0) {
      return NextResponse.json({ message: "No queries found to import", count: 0 });
    }

    // Group queries by normalized text
    type Bucket = { exemplars: string[]; totalVolume: number; count: number };
    const buckets = new Map<string, Bucket>();

    for (const q of queries) {
      const key = normalize(q.queryText || "");
      if (!key) continue;
      const searchVol = typeof q.searchVolume === "number" && q.searchVolume > 0 ? q.searchVolume : 1;
      const b = buckets.get(key) || { exemplars: [], totalVolume: 0, count: 0 };
      if (b.exemplars.length < 3 && q.queryText) b.exemplars.push(q.queryText);
      b.totalVolume += searchVol;
      b.count += 1;
      buckets.set(key, b);
    }

    if (buckets.size === 0) {
      return NextResponse.json({ message: "No valid query text to import", count: 0 });
    }

    // Build bulk upsert operations
    const ops: any[] = [];
    const now = new Date();
    for (const [canonicalTopic, meta] of buckets.entries()) {
      ops.push({
        updateOne: {
          filter: { tenantId: workspaceId, canonicalTopic },
          update: {
            $setOnInsert: {
              createdBy: session.user.id,
              periodStart: now,
              periodEnd: now,
              granularity: "weekly",
            },
            $set: {
              canonicalTopic,
              exemplarPrompts: meta.exemplars,
              estimatedVolume: meta.totalVolume,
              volumeCILow: Math.round(meta.totalVolume * 0.85),
              volumeCIHigh: Math.round(meta.totalVolume * 1.15),
              confidence: "medium",
              provenance: "model-inferred",
              observedFraction: 0,
              syntheticFraction: 0,
              isTrending: false,
              trendDirection: "stable",
            },
          },
          upsert: true,
        },
      });
    }

    if (ops.length === 0) {
      return NextResponse.json({ message: "Nothing to import", count: 0 });
    }

    const result = await PromptVolume.bulkWrite(ops, { ordered: false });

    return NextResponse.json({ message: "Import complete", count: buckets.size, result: result && (result as any).ok ? "ok" : result });
  } catch (error) {
    console.error("Error importing from queries:", error);
    return NextResponse.json({ error: "Failed to import from queries" }, { status: 500 });
  }
}
