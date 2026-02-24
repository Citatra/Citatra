"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Eye, Globe } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatGridSkeleton, ChartSkeleton } from "@/components/loading-skeletons";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface QueryMetric {
  queryId: string;
  queryText: string;
  searchVolume: number;
  aiVisibility: number;
  aiBrandMentions: number;
  aiTotal: number;
  avgSerpPosition: number | null;
  serpResults: number;
  sentiments: Record<string, number>;
  engines: string[];
}

interface DashboardData {
  queryMetrics: QueryMetric[];
  timeSeries: Array<{
    date: string;
    aiVisibility: number;
    serpCoverage: number;
    totalResults: number;
  }>;
  engineBreakdown: Record<string, { total: number; branded: number }>;
  summary: {
    totalQueries: number;
    totalResults: number;
    overallAiVisibility: number;
    queriesWithAiPresence: number;
  };
}

export default function SerpAiDashboardPage() {
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);

  const fetchData = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/serp-ai-dashboard`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={4} />
        <ChartSkeleton height="h-[350px]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Combined SERP + AI Dashboard"
        description="Unified view of organic search and AI visibility metrics."
        helpText="See how your traditional SERP rankings correlate with AI Overview visibility for each tracked keyword."
        actions={<Button onClick={fetchData} disabled={loading}>Refresh</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{data.summary.overallAiVisibility}%</p>
                <p className="text-xs text-muted-foreground">AI Visibility</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-2xl font-bold">{data.summary.queriesWithAiPresence}</p>
                <p className="text-xs text-muted-foreground">Queries w/ AI Presence</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-2xl font-bold">{data.summary.totalQueries}</p>
                <p className="text-xs text-muted-foreground">Tracked Queries</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-2xl font-bold">{data.summary.totalResults}</p>
                <p className="text-xs text-muted-foreground">Total Results</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 30-day trend chart */}
      <Card>
        <CardHeader>
          <CardTitle>30-Day Trend</CardTitle>
          <CardDescription>AI visibility and SERP coverage over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data.timeSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })}
                fontSize={12}
              />
              <YAxis yAxisId="left" unit="%" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="aiVisibility"
                stroke="#3b82f6"
                name="AI Visibility %"
                strokeWidth={2}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="serpCoverage"
                stroke="#10b981"
                name="SERP Coverage %"
                strokeWidth={2}
              />
              <Bar
                yAxisId="right"
                dataKey="totalResults"
                fill="#e2e8f0"
                name="Results"
                opacity={0.5}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Query table */}
      <Card>
        <CardHeader>
          <CardTitle>Query Performance</CardTitle>
          <CardDescription>Combined SERP and AI metrics per query</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Query</th>
                  <th className="text-center py-2 font-medium">AI Visibility</th>
                  <th className="text-center py-2 font-medium">SERP Position</th>
                  <th className="text-center py-2 font-medium">Volume</th>
                  <th className="text-center py-2 font-medium">AI Mentions</th>
                </tr>
              </thead>
              <tbody>
                {data.queryMetrics.map((q) => (
                  <tr key={q.queryId} className="border-b">
                    <td className="py-3 font-medium">{q.queryText}</td>
                    <td className="text-center py-3">
                      <Badge
                        variant={q.aiVisibility >= 50 ? "default" : q.aiVisibility > 0 ? "secondary" : "outline"}
                      >
                        {q.aiVisibility}%
                      </Badge>
                    </td>
                    <td className="text-center py-3">
                      {q.avgSerpPosition ? `#${q.avgSerpPosition}` : "—"}
                    </td>
                    <td className="text-center py-3 text-muted-foreground">
                      {q.searchVolume || "—"}
                    </td>
                    <td className="text-center py-3">
                      {q.aiBrandMentions}/{q.aiTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
