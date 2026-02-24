import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import AttributionDaily from "@/models/AttributionDaily";

export const runtime = "nodejs";

/**
 * POST /api/workspaces/[workspaceId]/traffic-attribution/export
 *
 * Body:
 *   mode      – "ga4"|"model"|"heuristic"|"all" (default all)
 *   since     – ISO date start
 *   to        – ISO date end
 *   columns   – string[] of column names to include (optional, defaults to all)
 *   format    – "json"|"csv" (default json)
 *   search    – optional text filter on queryText
 *
 * Returns the full attribution data set (not paginated) in the requested format.
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
    const {
      mode = "all",
      since,
      to,
      columns,
      format = "json",
      search,
    } = body as {
      mode?: string;
      since?: string;
      to?: string;
      columns?: string[];
      format?: "json" | "csv";
      search?: string;
    };

    const now = new Date();
    const sinceDate = since
      ? new Date(since).toISOString().split("T")[0]
      : new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0];
    const toDate = to
      ? new Date(to).toISOString().split("T")[0]
      : now.toISOString().split("T")[0];

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const filter: Record<string, any> = {
      workspaceId,
      date: { $gte: sinceDate, $lte: toDate },
    };
    if (mode && mode !== "all") {
      filter.modelSource = mode;
    }
    if (search) {
      filter.queryText = { $regex: search, $options: "i" };
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const rows = (await AttributionDaily.find(filter)
      .sort({ date: -1, visibilityCount: -1 })
      .lean()) as unknown as Array<Record<string, unknown>>;

    /* Column projection */
    const ALL_COLUMNS = [
      "date",
      "queryText",
      "visibilityCount",
      "brandMentionCount",
      "visibilityRate",
      "agentRequests",
      "agentRequestsByEngine",
      "ga4Sessions",
      "ga4Conversions",
      "estClicks",
      "estConversions",
      "modelSource",
      "modelVersion",
      "matchConfidence",
      "searchVolume",
      "positiveRate",
      "featureContributions",
    ];

    const activeCols =
      columns && columns.length > 0
        ? columns.filter((c) => ALL_COLUMNS.includes(c))
        : ALL_COLUMNS;

    const projected = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of activeCols) {
        obj[col] = (row as Record<string, unknown>)[col] ?? null;
      }
      return obj;
    });

    if (format === "csv") {
      const header = activeCols.join(",");
      const csvRows = projected.map((r) =>
        activeCols
          .map((col) => {
            const val = r[col];
            if (val === null || val === undefined) return "";
            if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(",")
      );
      const csv = [header, ...csvRows].join("\n");

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="traffic-attribution-${sinceDate}-${toDate}.csv"`,
        },
      });
    }

    return NextResponse.json({
      rows: projected,
      meta: {
        count: projected.length,
        columns: activeCols,
        dateRange: { since: sinceDate, to: toDate },
        mode,
      },
    });
  } catch (error) {
    console.error("Traffic attribution export error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
