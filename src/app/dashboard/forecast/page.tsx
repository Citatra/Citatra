"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ChartSkeleton, StatGridSkeleton } from "@/components/loading-skeletons";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, ComposedChart,
} from "recharts";

interface ForecastData {
  historicalData: {
    date: string; total: number; brandMentions: number; brandRate: number; avgPosition: number | null;
  }[];
  overallForecast: {
    currentVisibility: number; forecastedVisibility: number; trend: string;
    forecastPoints: { date: string; predicted: number }[];
  } | null;
  queryForecasts: {
    queryId: string; queryText: string; currentVisibility: number;
    forecastedVisibility: number; trend: string; dataPoints: number; confidence: string;
  }[];
  meta: { activeQueries: number; daysOfData: number; forecastHorizon: number };
}

export default function ForecastPage() {
  const { activeWorkspace } = useWorkspace();
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!activeWorkspace) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/workspaces/${activeWorkspace.id}/forecast`);
        if (!res.ok) throw new Error("Failed");
        setData(await res.json());
      } catch { toast.error("Failed to load forecast"); }
      finally { setLoading(false); }
    };
    load();
  }, [activeWorkspace?.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <ChartSkeleton height="h-[300px]" />
        <StatGridSkeleton count={3} />
      </div>
    );
  }

  const trendIcon = (t: string) => {
    if (t === "improving") return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (t === "declining") return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  // Combine historical + forecast for chart
  const chartData = [
    ...(data?.historicalData.map((d) => ({ date: d.date, actual: d.brandRate, predicted: undefined as number | undefined })) || []),
    ...(data?.overallForecast?.forecastPoints.map((d) => ({ date: d.date, actual: undefined as number | undefined, predicted: d.predicted })) || []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Visibility Forecast"
        description="Predicted visibility trends based on historical data"
        helpText="This forecast uses your historical visibility data to project future trends. The confidence interval narrows as more data is collected."
      />

      {/* Overall summary */}
      {data?.overallForecast && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Current Visibility</CardDescription>
              <CardTitle className="text-2xl">{data.overallForecast.currentVisibility}%</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>30-Day Forecast</CardDescription>
              <CardTitle className="text-2xl">{data.overallForecast.forecastedVisibility}%</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Trend</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                {trendIcon(data.overallForecast.trend)}
                <span className="capitalize">{data.overallForecast.trend}</span>
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Data Points</CardDescription>
              <CardTitle className="text-2xl">{data.meta.daysOfData} days</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Forecast chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Brand Visibility Rate (%) — Actual vs Forecast</CardTitle>
            <CardDescription>Historical brand mention rate with 30-day linear forecast</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                  fontSize={12}
                />
                <YAxis domain={[0, 100]} fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" name="Actual" strokeWidth={2} dot={false} connectNulls={false} />
                <Area type="monotone" dataKey="predicted" stroke="hsl(142, 71%, 45%)" fill="hsl(142, 71%, 45%, 0.1)" name="Forecast" strokeDasharray="5 5" dot={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-query forecasts */}
      {data && data.queryForecasts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Per-Query Forecasts</CardTitle>
            <CardDescription>Predicted visibility changes for individual queries</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Forecast</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.queryForecasts.map((q) => (
                  <TableRow key={q.queryId}>
                    <TableCell className="font-medium max-w-[250px] truncate">{q.queryText}</TableCell>
                    <TableCell className="text-right">{q.currentVisibility}%</TableCell>
                    <TableCell className="text-right">{q.forecastedVisibility}%</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {trendIcon(q.trend)}
                        <span className="text-sm capitalize">{q.trend}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={q.confidence === "high" ? "default" : q.confidence === "medium" ? "secondary" : "outline"}>
                        {q.confidence}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!data?.overallForecast && !loading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p>Not enough historical data for forecasting yet.</p>
            <p className="text-sm">Track queries and fetch results over multiple days to generate predictions.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
