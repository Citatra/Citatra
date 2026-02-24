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
import { Loader2, ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatGridSkeleton, ChartSkeleton } from "@/components/loading-skeletons";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

interface CompetitorStat {
  id: string;
  name: string;
  domain: string;
  color: string;
  totalMentions: number;
  visibility: number;
}

interface QueryComparison {
  queryId: string;
  queryText: string;
  total: number;
  brandMentions: number;
  brandVisibility: number;
  competitors: {
    domain: string;
    name: string;
    color: string;
    mentions: number;
    visibility: number;
  }[];
}

interface EngineDist {
  engine: string;
  total: number;
  brandMentions: number;
}

interface CompareData {
  period: { days: number; since: string };
  brand: { domain: string; totalMentions: number; visibility: number };
  competitors: CompetitorStat[];
  dailyComparison: Record<string, unknown>[];
  queryComparison: QueryComparison[];
  engineDistribution: EngineDist[];
  totalResults: number;
}

const BRAND_COLOR = "#2563eb";
const PIE_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function CompareAnalyticsPage() {
  const { activeWorkspace, loading: wsLoading } = useWorkspace();
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");

  const fetchData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/competitors/compare?days=${days}`
      );
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error("Failed to load comparison data");
      }
    } catch {
      toast.error("Failed to load comparison data");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, days]);

  useEffect(() => {
    if (activeWorkspace) fetchData();
  }, [activeWorkspace, days, fetchData]);

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
            Select a workspace to view comparison analytics
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Competitor Comparison"
        description="Compare your brand visibility against competitors in Google AI Overviews"
        helpText="Side-by-side comparison of how your brand vs competitors appear in AI Overview results. Select a time range to analyze trends."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/competitors">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[150px]">
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
          </div>
        }
      />

      {loading ? (
        <ChartSkeleton height="h-[300px]" />
      ) : !data || data.competitors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48">
            <p className="text-muted-foreground mb-2">
              No competitors tracked yet
            </p>
            <Link href="/dashboard/competitors">
              <Button variant="outline" size="sm">
                Add Competitors
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Visibility Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Your Brand</CardDescription>
                <CardTitle className="text-2xl">{data.brand.visibility}%</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {data.brand.domain} &middot; {data.brand.totalMentions} mentions
                </p>
              </CardContent>
            </Card>
            {data.competitors.slice(0, 3).map((comp) => {
              const diff = comp.visibility - data.brand.visibility;
              return (
                <Card key={comp.id}>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full inline-block"
                        style={{ backgroundColor: comp.color }}
                      />
                      {comp.name}
                    </CardDescription>
                    <CardTitle className="text-2xl flex items-center gap-2">
                      {comp.visibility}%
                      {diff > 0 ? (
                        <TrendingUp className="h-4 w-4 text-destructive" />
                      ) : diff < 0 ? (
                        <TrendingDown className="h-4 w-4 text-green-500" />
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {comp.domain} &middot; {comp.totalMentions} mentions
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Visibility Bar Chart (all domains) */}
          <Card>
            <CardHeader>
              <CardTitle>Visibility Rate Comparison</CardTitle>
              <CardDescription>
                % of tracked results mentioning each domain
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      {
                        name: data.brand.domain || "Your Brand",
                        visibility: data.brand.visibility,
                        fill: BRAND_COLOR,
                      },
                      ...data.competitors.map((c) => ({
                        name: c.name,
                        visibility: c.visibility,
                        fill: c.color,
                      })),
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis unit="%" />
                    <Tooltip
                      formatter={(value: number | undefined) => [`${value ?? 0}%`, "Visibility"]}
                    />
                    <Bar dataKey="visibility" radius={[4, 4, 0, 0]}>
                      {[
                        { fill: BRAND_COLOR },
                        ...data.competitors.map((c) => ({ fill: c.color })),
                      ].map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Daily Comparison Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Daily Trend</CardTitle>
              <CardDescription>
                Mentions per day: your brand vs. competitors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.dailyComparison}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v: string) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(v: unknown) =>
                        new Date(String(v)).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      }
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey={data.brand.domain || "your_brand"}
                      name={data.brand.domain || "Your Brand"}
                      stroke={BRAND_COLOR}
                      strokeWidth={2}
                      dot={false}
                    />
                    {data.competitors.map((comp) => (
                      <Line
                        key={comp.domain}
                        type="monotone"
                        dataKey={comp.domain}
                        name={comp.name}
                        stroke={comp.color}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Per-Query Comparison Table */}
          <Card>
            <CardHeader>
              <CardTitle>Per-Query Breakdown</CardTitle>
              <CardDescription>
                Visibility comparison by individual query
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Query</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: BRAND_COLOR }}
                        />
                        Your Brand
                      </div>
                    </TableHead>
                    {data.competitors.map((comp) => (
                      <TableHead key={comp.id} className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ backgroundColor: comp.color }}
                          />
                          {comp.name}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.queryComparison.map((q) => (
                    <TableRow key={q.queryId}>
                      <TableCell className="font-medium max-w-[250px] truncate">
                        {q.queryText}
                      </TableCell>
                      <TableCell className="text-center">{q.total}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={q.brandVisibility > 0 ? "default" : "secondary"}>
                          {q.brandVisibility}%
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-1">
                          ({q.brandMentions})
                        </span>
                      </TableCell>
                      {q.competitors.map((c) => (
                        <TableCell key={c.domain} className="text-center">
                          <Badge
                            variant={c.visibility > 0 ? "outline" : "secondary"}
                            style={
                              c.visibility > 0
                                ? { borderColor: c.color, color: c.color }
                                : {}
                            }
                          >
                            {c.visibility}%
                          </Badge>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({c.mentions})
                          </span>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {data.queryComparison.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3 + data.competitors.length}
                        className="text-center text-muted-foreground"
                      >
                        No query data for this period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
