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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Bot,
  Globe,
  FileSearch,
  Activity,
  Zap,
  Shield,
  Clock,
  Eye,
  AlertTriangle,
  ExternalLink,
  Server,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatGridSkeleton, ChartSkeleton, TableSkeleton } from "@/components/loading-skeletons";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OverviewStats {
  totalRequests: number;
  avgResponseTime: number;
  avgCacheHitRate: number;
  avgConfidence: number;
  uniqueEngines: number;
  uniquePages: number;
  previousPeriodRequests: number;
  changePercent: number;
}

interface TrendPoint {
  date: string;
  total: number;
  chatgpt?: number;
  gemini?: number;
  perplexity?: number;
  bing?: number;
  claude?: number;
  deepseek?: number;
  meta?: number;
  apple?: number;
  unknown?: number;
}

interface EngineBreakdown {
  engine: string;
  totalRequests: number;
  avgResponseTime: number;
  avgCacheHitRate: number;
  avgConfidence: number;
  uniquePages: number;
}

interface TopPage {
  url: string;
  totalRequests: number;
  avgResponseTime: number;
  avgCacheHitRate: number;
  engineCount: number;
  engines: string[];
  firstSeen: string;
  lastSeen: string;
  title: string;
  pageType: string;
  aiVisibilityScore: number;
  contentEffectivenessScore: number;
}

interface GeoEntry {
  country: string;
  totalRequests: number;
}

interface PurposeEntry {
  purpose: string;
  totalRequests: number;
}

interface LiveEvent {
  id: string;
  timestamp: string;
  canonicalUrl: string;
  engine: string;
  agentPurpose: string;
  statusCode: number;
  responseTimeMs: number;
  cacheStatus: string;
  country: string;
  classificationConfidence: number;
  userAgent: string;
}

interface CrawlGap {
  url: string;
  title: string;
  pageType: string;
  aiVisibilityScore: number;
  totalAgentRequests: number;
  lastAgentAccessAt: string | null;
}

interface AgentAnalyticsData {
  days: number;
  engine: string;
  overview: OverviewStats;
  trends: TrendPoint[];
  engines: EngineBreakdown[];
  pages: TopPage[];
  geo: GeoEntry[];
  purposes: PurposeEntry[];
  live: LiveEvent[];
  crawlGaps: CrawlGap[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PURPOSE_LABELS: Record<string, string> = {
  index: "Indexing",
  "real-time": "Real-time Retrieval",
  training: "Training / Crawling",
  preview: "Preview / Inspection",
  unknown: "Unknown",
};

const PURPOSE_COLORS: Record<string, string> = {
  index: "#3b82f6",
  "real-time": "#22c55e",
  training: "#f59e0b",
  preview: "#8b5cf6",
  unknown: "#9ca3af",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function truncateUrl(url: string, max = 60): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 3) + "…";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentAnalyticsPage() {
  const { activeWorkspace, loading: wsLoading } = useWorkspace();
  const [data, setData] = useState<AgentAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState("30");

  const fetchData = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const params = new URLSearchParams({ days, section: "all" });

      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/agent-analytics?${params}`
      );
      if (!res.ok) throw new Error("Failed to fetch agent analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load agent analytics data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeWorkspace, days]);

  useEffect(() => {
    if (!wsLoading && activeWorkspace) {
      setLoading(true);
      fetchData();
    }
  }, [wsLoading, activeWorkspace, fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // ── Loading / Empty states ───────────────────────────────────────
  if (wsLoading || loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Agent Analytics"
          description="AI crawler and agent traffic analysis"
        />
        <StatGridSkeleton count={4} />
        <ChartSkeleton />
        <TableSkeleton rows={5} cols={5} />
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="space-y-6">
        <PageHeader title="Agent Analytics" />
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Select a workspace to view agent analytics.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overview = data?.overview;
  const hasData = overview && overview.totalRequests > 0;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <PageHeader
        title="Agent Analytics"
        description="Monitor how AI crawlers and agents interact with your content"
        helpText="Agent Analytics tracks requests from AI systems that crawl your content. Data is aggregated daily from raw server-side logs."
        actions={
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="180">180 days</SelectItem>
                <SelectItem value="365">365 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Agent Requests"
          value={formatNumber(overview?.totalRequests || 0)}
          change={overview?.changePercent}
          icon={<Bot className="h-4 w-4 text-muted-foreground" />}
          description={`vs previous ${days} days`}
        />
        <StatCard
          title="Unique Pages Crawled"
          value={formatNumber(overview?.uniquePages || 0)}
          icon={<FileSearch className="h-4 w-4 text-muted-foreground" />}
          description="Pages accessed by AI agents"
        />
        <StatCard
          title="Avg Response Time"
          value={`${overview?.avgResponseTime || 0}ms`}
          icon={<Zap className="h-4 w-4 text-muted-foreground" />}
          description="Server response to crawlers"
        />
        <StatCard
          title="Cache Hit Rate"
          value={`${Math.round((overview?.avgCacheHitRate || 0) * 100)}%`}
          icon={<Server className="h-4 w-4 text-muted-foreground" />}
          description={`${overview?.uniqueEngines || 0} unique agents detected`}
        />
      </div>

      {/* ── Tabbed Content ─────────────────────────────────────────── */}
      {!hasData ? (
        <EmptyState />
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="live">Live Log</TabsTrigger>
            <TabsTrigger value="gaps">Crawl Gaps</TabsTrigger>
          </TabsList>

          {/* ── Overview Tab ──────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4">
            {/* Trends Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Request Trends
                </CardTitle>
                <CardDescription>
                  Daily agent request volume over the last {days} days
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data?.trends && data.trends.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <AreaChart data={data.trends} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <defs>
                        <linearGradient id="gradient-total" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d: string) => {
                          const date = new Date(d);
                          return `${date.getMonth() + 1}/${date.getDate()}`;
                        }}
                        className="text-xs"
                      />
                      <YAxis className="text-xs" />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                        labelFormatter={(d) => new Date(String(d)).toLocaleDateString()}
                      />
                      <Area
                        type="monotone"
                        dataKey="total"
                        name="Total Requests"
                        stroke="hsl(var(--primary))"
                        fill="url(#gradient-total)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                    No trend data available for this period
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Purpose Breakdown + Geo side by side */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Purpose Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Access Purpose
                  </CardTitle>
                  <CardDescription>
                    Why AI agents are accessing your content
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data?.purposes && data.purposes.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={data.purposes.map((p) => ({
                            name: PURPOSE_LABELS[p.purpose] || p.purpose,
                            value: p.totalRequests,
                            purpose: p.purpose,
                          }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={3}
                          dataKey="value"
                          label={(props) => {
                            const { name, percent } = props as { name?: string; percent?: number };
                            return `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`;
                          }}
                          labelLine={false}
                        >
                          {data.purposes.map((p) => (
                            <Cell
                              key={p.purpose}
                              fill={PURPOSE_COLORS[p.purpose] || "#9ca3af"}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                      No purpose data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Geographic Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Geographic Distribution
                  </CardTitle>
                  <CardDescription>
                    Top countries where agent requests originate
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data?.geo && data.geo.length > 0 ? (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto">
                      {data.geo.slice(0, 15).map((g, i) => {
                        const maxReq = data.geo[0]?.totalRequests || 1;
                        const pct = (g.totalRequests / maxReq) * 100;
                        return (
                          <div key={g.country || i} className="flex items-center gap-3">
                            <span className="text-sm font-mono w-8 text-muted-foreground">
                              {g.country || "??"}
                            </span>
                            <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary/70 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-sm tabular-nums w-16 text-right">
                              {formatNumber(g.totalRequests)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                      No geographic data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Pages Tab ─────────────────────────────────────────── */}
          <TabsContent value="pages" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Most AI-Accessed Pages
                </CardTitle>
                <CardDescription>
                  Pages with the highest AI agent interaction, ranked by total requests
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data?.pages && data.pages.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[300px]">Page</TableHead>
                          <TableHead className="text-right">Requests</TableHead>
                          <TableHead className="text-right">Avg Response</TableHead>
                          <TableHead className="text-right">Visibility</TableHead>
                          <TableHead>Last Seen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.pages.map((p, i) => (
                          <TableRow key={p.url || i}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-sm font-medium truncate max-w-[280px] inline-block">
                                          {p.title || truncateUrl(p.url)}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-md">
                                        <p className="text-xs break-all">{p.url}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  {p.pageType !== "other" && (
                                    <Badge variant="outline" className="text-[10px]">
                                      {p.pageType}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate max-w-[280px]">
                                  {truncateUrl(p.url, 70)}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {formatNumber(p.totalRequests)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {p.avgResponseTime}ms
                            </TableCell>
                            <TableCell className="text-right">
                              <VisibilityBar score={p.aiVisibilityScore} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {p.lastSeen || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    No page data available for this period
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Live Log Tab ──────────────────────────────────────── */}
          <TabsContent value="live" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Live Crawler Log
                </CardTitle>
                <CardDescription>
                  Recent AI agent requests in real-time (last 30 events)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data?.live && data.live.length > 0 ? (
                  <div className="space-y-2">
                    {data.live.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div
                          className="mt-1 h-2.5 w-2.5 rounded-full shrink-0 bg-primary"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">
                              {PURPOSE_LABELS[event.agentPurpose] || event.agentPurpose}
                            </Badge>
                            <StatusBadge code={event.statusCode} />
                            {event.cacheStatus && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  event.cacheStatus === "HIT"
                                    ? "border-green-500/50 text-green-600"
                                    : "border-orange-500/50 text-orange-600"
                                }`}
                              >
                                {event.cacheStatus}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto shrink-0">
                              {timeAgo(event.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm truncate text-foreground">
                            {event.canonicalUrl}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {event.responseTimeMs}ms
                            </span>
                            {event.country && (
                              <span className="flex items-center gap-1">
                                <Globe className="h-3 w-3" />
                                {event.country}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Shield className="h-3 w-3" />
                              {Math.round(event.classificationConfidence * 100)}% confidence
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <Activity className="h-8 w-8 opacity-50" />
                    <p>No recent crawler activity</p>
                    <p className="text-xs">Agent requests will appear here once ingested</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Crawl Gaps Tab ────────────────────────────────────── */}
          <TabsContent value="gaps" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Crawl Gap Detection
                </CardTitle>
                <CardDescription>
                  Pages with low or no AI agent visibility — potential optimization targets
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data?.crawlGaps && data.crawlGaps.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[300px]">Page</TableHead>
                        <TableHead className="text-right">Agent Requests</TableHead>
                        <TableHead className="text-right">AI Visibility</TableHead>
                        <TableHead>Last Agent Access</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.crawlGaps.map((gap, i) => (
                        <TableRow key={gap.url || i}>
                          <TableCell>
                            <div className="space-y-1">
                              <span className="text-sm font-medium">
                                {gap.title || truncateUrl(gap.url, 50)}
                              </span>
                              <p className="text-xs text-muted-foreground truncate max-w-[280px]">
                                {truncateUrl(gap.url, 70)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {gap.totalAgentRequests}
                          </TableCell>
                          <TableCell className="text-right">
                            <VisibilityBar score={gap.aiVisibilityScore} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {gap.lastAgentAccessAt
                              ? new Date(gap.lastAgentAccessAt).toLocaleDateString()
                              : "Never"}
                          </TableCell>
                          <TableCell>
                            {gap.totalAgentRequests === 0 ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Not crawled
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Low visibility
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <Eye className="h-8 w-8 opacity-50" />
                    <p>No crawl gaps detected</p>
                    <p className="text-xs">All indexed pages have been accessed by AI agents</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StatCard({
  title,
  value,
  change,
  icon,
  description,
}: {
  title: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-1 mt-1">
          {change !== undefined && change !== null && (
            <span
              className={`inline-flex items-center text-xs font-medium ${
                change >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {change >= 0 ? (
                <TrendingUp className="h-3 w-3 mr-0.5" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-0.5" />
              )}
              {change >= 0 ? "+" : ""}
              {change}%
            </span>
          )}
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80
      ? "border-green-500/50 text-green-600"
      : pct >= 50
      ? "border-yellow-500/50 text-yellow-600"
      : "border-red-500/50 text-red-600";

  return (
    <Badge variant="outline" className={`text-[10px] ${color}`}>
      {pct}%
    </Badge>
  );
}

function StatusBadge({ code }: { code: number }) {
  const color =
    code >= 200 && code < 300
      ? "border-green-500/50 text-green-600 bg-green-50"
      : code >= 300 && code < 400
      ? "border-blue-500/50 text-blue-600 bg-blue-50"
      : code >= 400 && code < 500
      ? "border-orange-500/50 text-orange-600 bg-orange-50"
      : "border-red-500/50 text-red-600 bg-red-50";

  return (
    <Badge variant="outline" className={`text-[10px] ${color}`}>
      {code}
    </Badge>
  );
}

function VisibilityBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums">{score}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="relative">
          <Bot className="h-16 w-16 text-muted-foreground/30" />
          <Activity className="h-6 w-6 text-muted-foreground/50 absolute -bottom-1 -right-1" />
        </div>
        <div className="text-center space-y-2 max-w-md">
          <h3 className="text-lg font-semibold">No Agent Data Yet</h3>
          <p className="text-sm text-muted-foreground">
            Agent Analytics tracks how AI crawlers and bots interact with your content.
            Data will appear once you start ingesting agent requests via your CDN integration
            or log upload.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground mt-2">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            <span>Set up a CDN integration (Cloudflare, Vercel, etc.)</span>
          </div>
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4" />
            <span>Or upload server logs via the API</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>Requests are classified and verified automatically</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
