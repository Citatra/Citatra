import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Membership from "@/models/Membership";
import Query from "@/models/Query";
import TrackingResult from "@/models/TrackingResult";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/forecast
 *
 * AI Visibility Forecasting — uses historical tracking data to predict
 * future visibility trends via linear regression on time-series data.
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

    const activeQueries = await Query.find({
      tenantId: workspaceId,
      status: "active",
    }).lean();

    // Build daily time series for the last 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const dailyAgg = await TrackingResult.aggregate([
      {
        $match: {
          tenantId: workspaceId,
          fetchedAt: { $gte: ninetyDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$fetchedAt" } },
          total: { $sum: 1 },
          brandMentions: { $sum: { $cond: ["$isBrandMentioned", 1, 0] } },
          avgPosition: {
            $avg: {
              $cond: [{ $gt: ["$sourcePosition", 0] }, "$sourcePosition", null],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Build per-query forecasts
    const queryForecasts = [];
    for (const q of activeQueries.slice(0, 20)) {
      const qId = String((q as unknown as Record<string, unknown>)._id);
      const qText = (q as unknown as Record<string, unknown>).queryText as string;

      const qDaily = await TrackingResult.aggregate([
        {
          $match: {
            queryId: qId,
            tenantId: workspaceId,
            fetchedAt: { $gte: ninetyDaysAgo },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$fetchedAt" } },
            brandMentions: { $sum: { $cond: ["$isBrandMentioned", 1, 0] } },
            total: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      if (qDaily.length < 2) continue;

      const series = qDaily.map((d, i) => ({
        x: i,
        y: d.total > 0 ? (d.brandMentions / d.total) * 100 : 0,
      }));

      const { slope, intercept } = linearRegression(series);
      const currentRate = series[series.length - 1].y;
      const forecastRate = Math.max(
        0,
        Math.min(100, slope * (series.length + 30) + intercept)
      );

      const trend =
        slope > 0.5 ? "improving" : slope < -0.5 ? "declining" : "stable";

      queryForecasts.push({
        queryId: qId,
        queryText: qText,
        currentVisibility: Math.round(currentRate * 10) / 10,
        forecastedVisibility: Math.round(forecastRate * 10) / 10,
        trend,
        dataPoints: qDaily.length,
        confidence:
          qDaily.length >= 14
            ? "high"
            : qDaily.length >= 7
              ? "medium"
              : "low",
      });
    }

    // Overall workspace forecast
    const overallSeries = dailyAgg.map((d, i) => ({
      x: i,
      y: d.total > 0 ? (d.brandMentions / d.total) * 100 : 0,
    }));

    let overallForecast = null;
    if (overallSeries.length >= 2) {
      const { slope, intercept } = linearRegression(overallSeries);
      const current = overallSeries[overallSeries.length - 1].y;
      const predicted = Math.max(
        0,
        Math.min(100, slope * (overallSeries.length + 30) + intercept)
      );

      // Generate 30-day prediction points
      const forecastPoints = [];
      const lastDate = new Date(dailyAgg[dailyAgg.length - 1]._id);
      for (let d = 1; d <= 30; d++) {
        const date = new Date(lastDate);
        date.setDate(date.getDate() + d);
        const val = Math.max(
          0,
          Math.min(100, slope * (overallSeries.length + d) + intercept)
        );
        forecastPoints.push({
          date: date.toISOString().split("T")[0],
          predicted: Math.round(val * 10) / 10,
        });
      }

      overallForecast = {
        currentVisibility: Math.round(current * 10) / 10,
        forecastedVisibility: Math.round(predicted * 10) / 10,
        trend:
          slope > 0.5 ? "improving" : slope < -0.5 ? "declining" : "stable",
        forecastPoints,
      };
    }

    return NextResponse.json({
      historicalData: dailyAgg.map((d) => ({
        date: d._id,
        total: d.total,
        brandMentions: d.brandMentions,
        brandRate: d.total > 0 ? Math.round((d.brandMentions / d.total) * 100 * 10) / 10 : 0,
        avgPosition: d.avgPosition ? Math.round(d.avgPosition * 10) / 10 : null,
      })),
      overallForecast,
      queryForecasts: queryForecasts.sort((a, b) =>
        a.trend === "declining" && b.trend !== "declining" ? -1 : 1
      ),
      meta: {
        activeQueries: activeQueries.length,
        daysOfData: dailyAgg.length,
        forecastHorizon: 30,
      },
    });
  } catch (error) {
    console.error("Forecast error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}
