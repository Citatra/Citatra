"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, Minus, Flag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ChartSkeleton } from "@/components/loading-skeletons";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

interface DailyPoint {
  date: string;
  visibility: number;
  totalResults: number;
  brandMentions: number;
  avgPosition: number | null;
  uniqueSources: number;
  sentiments: Record<string, number>;
}

interface Milestone {
  date: string;
  type: string;
  description: string;
}

interface QueryHistory {
  queryId: string;
  queryText: string;
  dailySeries: DailyPoint[];
  milestones: Milestone[];
  trend: "up" | "down" | "stable";
  currentVisibility: number;
  totalDataPoints: number;
}

export default function HistoricalPerformancePage() {
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [queries, setQueries] = useState<QueryHistory[]>([]);
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [days, setDays] = useState(90);

  const fetchData = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const url = `/api/workspaces/${activeWorkspace.id}/historical-performance?days=${days}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setQueries(data.queries);
      if (data.queries.length > 0 && !selectedQuery) {
        setSelectedQuery(data.queries[0].queryId);
      }
    } catch {
      toast.error("Failed to load historical data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id, days]);

  const activeQuery = queries.find((q) => q.queryId === selectedQuery);

  const trendIcon = (trend: string) => {
    switch (trend) {
      case "up": return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "down": return <TrendingDown className="h-4 w-4 text-red-500" />;
      default: return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Historical Performance Tracker"
        description="Track query visibility, sentiment, and source changes over time."
        helpText="View historical trends over different time windows. Each data point shows visibility, citation count, and sentiment for that day."
        actions={
          <div className="flex gap-2">
            {[30, 60, 90].map((d) => (
              <Button
                key={d}
                variant={days === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        }
      />

      {loading ? (
        <ChartSkeleton height="h-[350px]" />
      ) : (
        <>
          {/* Query selector */}
          <div className="flex gap-2 flex-wrap">
            {queries.map((q) => (
              <Button
                key={q.queryId}
                variant={selectedQuery === q.queryId ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedQuery(q.queryId)}
                className="max-w-[200px] truncate"
              >
                {trendIcon(q.trend)}
                <span className="ml-1 truncate">{q.queryText}</span>
                <Badge variant="outline" className="ml-1 text-xs">
                  {q.currentVisibility}%
                </Badge>
              </Button>
            ))}
          </div>

          {activeQuery && (
            <>
              {/* Main Chart */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{activeQuery.queryText}</CardTitle>
                      <CardDescription>
                        {activeQuery.totalDataPoints} data points over {days} days
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {trendIcon(activeQuery.trend)}
                      <Badge variant={activeQuery.trend === "up" ? "default" : activeQuery.trend === "down" ? "destructive" : "secondary"}>
                        {activeQuery.trend}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={activeQuery.dailySeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) =>
                          new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })
                        }
                        fontSize={12}
                      />
                      <YAxis unit="%" />
                      <Tooltip
                        labelFormatter={(v) => new Date(v as string).toLocaleDateString()}
                      />
                      <Area
                        type="monotone"
                        dataKey="visibility"
                        stroke="#3b82f6"
                        fill="#3b82f680"
                        strokeWidth={2}
                      />
                      {activeQuery.milestones.map((m, i) => (
                        <ReferenceLine
                          key={i}
                          x={m.date}
                          stroke={m.type === "visibility_spike" ? "#22c55e" : "#ef4444"}
                          strokeDasharray="3 3"
                          label={{ value: "!", position: "top" }}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Milestones */}
              {activeQuery.milestones.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Milestones</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {activeQuery.milestones.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 border-b pb-2">
                          <Flag className="h-4 w-4 text-orange-500" />
                          <span className="text-sm font-medium">{new Date(m.date).toLocaleDateString()}</span>
                          <Badge variant="outline" className="capitalize text-xs">
                            {m.type.replace("_", " ")}
                          </Badge>
                          <span className="text-sm text-muted-foreground">{m.description}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Summary table */}
              <Card>
                <CardHeader>
                  <CardTitle>All Queries Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Query</th>
                          <th className="text-center py-2 font-medium">Current</th>
                          <th className="text-center py-2 font-medium">Trend</th>
                          <th className="text-center py-2 font-medium">Data Points</th>
                          <th className="text-center py-2 font-medium">Milestones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {queries.map((q) => (
                          <tr
                            key={q.queryId}
                            className={`border-b cursor-pointer hover:bg-muted/50 ${
                              selectedQuery === q.queryId ? "bg-muted/30" : ""
                            }`}
                            onClick={() => setSelectedQuery(q.queryId)}
                          >
                            <td className="py-3 font-medium">{q.queryText}</td>
                            <td className="text-center py-3">
                              <Badge variant={q.currentVisibility >= 50 ? "default" : "outline"}>
                                {q.currentVisibility}%
                              </Badge>
                            </td>
                            <td className="text-center py-3">
                              <div className="flex items-center justify-center gap-1">
                                {trendIcon(q.trend)}
                                <span className="capitalize text-xs">{q.trend}</span>
                              </div>
                            </td>
                            <td className="text-center py-3 text-muted-foreground">
                              {q.totalDataPoints}
                            </td>
                            <td className="text-center py-3">{q.milestones.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {queries.length === 0 && !loading && (
            <Card>
              <CardContent className="py-12 text-center">
                <CardDescription>No historical data available. Start tracking queries to build history.</CardDescription>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
