"use client";

import { useWorkspace } from "@/components/workspace-provider";
import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatGridSkeleton, ChartSkeleton } from "@/components/loading-skeletons";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface MentionsData {
  date: string;
  total: number;
  brandMentions: number;
}

interface VisibilityData {
  date: string;
  score: number;
  total: number;
  brandMentions: number;
}

interface SentimentData {
  sentiment: string;
  count: number;
}

interface QueryPerf {
  queryId: string;
  queryText: string;
  totalResults: number;
  brandMentions: number;
  visibilityRate: number;
  lastFetched: string;
}

interface AnalyticsData {
  period: { days: number; since: string };
  mentionsOverTime: MentionsData[];
  visibilityScore: VisibilityData[];
  sentimentDistribution: SentimentData[];
  topSources: { url: string; hostname: string; count: number; isBrand: boolean }[];
  queryPerformance: QueryPerf[];
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#22c55e",
  neutral: "#3b82f6",
  negative: "#ef4444",
  mixed: "#f59e0b",
  unknown: "#6b7280",
};

export default function AnalyticsPage() {
  const { activeWorkspace, loading: wsLoading } = useWorkspace();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState("30");

  const fetchAnalytics = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/analytics?days=${days}`
      );
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error("Failed to load analytics");
      }
    } catch {
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, days]);

  useEffect(() => {
    if (activeWorkspace) {
      setLoading(true);
      fetchAnalytics();
    }
  }, [activeWorkspace, fetchAnalytics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
    toast.success("Analytics refreshed");
  };

  if (wsLoading) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={4} />
        <ChartSkeleton />
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-semibold">No workspace selected</h2>
          <p className="text-muted-foreground mt-2">
            Select a workspace to view analytics
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Analytics"
        description="AI Overview visibility trends and insights"
        helpText="View historical trends of your AI Overview visibility, including citation rates, share of voice, and per-query performance over time."
        actions={
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Refresh
          </Button>
        </div>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <StatGridSkeleton count={4} />
          <ChartSkeleton />
        </div>
      ) : !data || data.mentionsOverTime.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No analytics data yet</p>
              <p className="text-sm">
                Start tracking queries to see visibility trends
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Visibility Score Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Visibility Score</CardTitle>
              <CardDescription>
                Percentage of AI Overviews mentioning your brand over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.visibilityScore}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Visibility"]}
                    labelFormatter={(label) =>
                      new Date(label).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ fill: "#8b5cf6", r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Mentions Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Mentions Over Time</CardTitle>
              <CardDescription>
                Total AI Overview results vs. brand mentions per day
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.mentionsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getMonth() + 1}/${d.getDate()}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(label) =>
                      new Date(label).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    }
                  />
                  <Legend />
                  <Bar
                    dataKey="total"
                    fill="#3b82f6"
                    name="Total Results"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="brandMentions"
                    fill="#22c55e"
                    name="Brand Mentions"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Sentiment + Top Sources side by side */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Sentiment Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Sentiment Distribution</CardTitle>
                <CardDescription>
                  Sentiment analysis of AI overview content
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data.sentimentDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name || "?"} (${((percent || 0) * 100).toFixed(0)}%)`
                      }
                      outerRadius={80}
                      dataKey="count"
                      nameKey="sentiment"
                    >
                      {data.sentimentDistribution.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={SENTIMENT_COLORS[entry.sentiment] || "#6b7280"}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top Sources */}
            <Card>
              <CardHeader>
                <CardTitle>Top Sources</CardTitle>
                <CardDescription>
                  Most frequently cited sources in AI Overviews
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.topSources.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    No source data available
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
                    {data.topSources.slice(0, 10).map((source, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-muted-foreground w-5 text-right">
                            {i + 1}.
                          </span>
                          <span className="truncate max-w-[200px]">
                            {source.hostname}
                          </span>
                          {source.isBrand && (
                            <Badge variant="secondary" className="text-xs">
                              You
                            </Badge>
                          )}
                        </div>
                        <span className="font-medium">{source.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Query Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle>Query Performance</CardTitle>
              <CardDescription>
                Brand visibility breakdown by tracked query
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Mentions</TableHead>
                    <TableHead className="text-right">Visibility</TableHead>
                    <TableHead className="text-right">Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.queryPerformance.map((qp) => (
                    <TableRow key={qp.queryId}>
                      <TableCell className="font-medium max-w-[250px] truncate">
                        {qp.queryText}
                      </TableCell>
                      <TableCell className="text-right">
                        {qp.totalResults}
                      </TableCell>
                      <TableCell className="text-right">
                        {qp.brandMentions}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            qp.visibilityRate > 50
                              ? "default"
                              : qp.visibilityRate > 0
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {qp.visibilityRate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {qp.visibilityRate > 50 ? (
                          <TrendingUp className="h-4 w-4 text-green-600 inline" />
                        ) : qp.visibilityRate > 0 ? (
                          <BarChart3 className="h-4 w-4 text-blue-500 inline" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-muted-foreground inline" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
