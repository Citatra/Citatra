"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Activity,
  Eye,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Download,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  StatGridSkeleton,
  ChartSkeleton,
} from "@/components/loading-skeletons";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OverviewData {
  totalMentions: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positivePercent: number;
  neutralPercent: number;
  negativePercent: number;
  netSentiment: number;
  entitiesTracked: number;
}

interface EntityData {
  name: string;
  domain: string;
  color: string;
  isBrand: boolean;
  mentions: number;
  sov: number;
  positive: number;
  neutral: number;
  negative: number;
  positivePercent: number;
  negativePercent: number;
  netSentiment: number;
}

interface DailyPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  positiveShare: number;
  negativeShare: number;
}

interface EngineData {
  engine: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  netSentiment: number;
}

interface TopicData {
  topic: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  netSentiment: number;
}

interface MovingTheme {
  topic: string;
  currentNet: number;
  previousNet: number;
  change: number;
}

interface PromptData {
  queryId: string;
  queryText: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  netSentiment: number;
  sampleSnippets: string[];
}

interface WeeklyEntity {
  name: string;
  sov: number;
  sentiment: { positive: number; neutral: number; negative: number };
}

interface WeeklyData {
  week: string;
  entities: WeeklyEntity[];
}

interface SentimentDashboardData {
  overview: OverviewData;
  entityComparison: EntityData[];
  dailyTrend: DailyPoint[];
  engineBreakdown: EngineData[];
  topicBreakdown: TopicData[];
  topMovingThemes: MovingTheme[];
  topPrompts: PromptData[];
  weeklyTrend: WeeklyData[];
  filters: {
    engines: string[];
    topics: string[];
    entities: Array<{ name: string; domain: string }>;
  };
}

interface EntityDetail {
  entity: {
    name: string;
    domain: string;
    isBrand: boolean;
    totalMentions: number;
    positive: number;
    neutral: number;
    negative: number;
    netSentiment: number;
  };
  dailyTrend: Array<{
    date: string;
    positive: number;
    neutral: number;
    negative: number;
    total: number;
  }>;
  topicBreakdown: TopicData[];
  exemplarResponses: Array<{
    sentiment: string;
    snippet: string;
    overviewExcerpt: string;
    engine: string;
    date: string;
    sourceUrl: string;
  }>;
  topCitationDomains: Array<{ domain: string; count: number }>;
}

/* ------------------------------------------------------------------ */
/*  Colours                                                            */
/* ------------------------------------------------------------------ */

const SENTIMENT_COLORS = {
  positive: "#22c55e",
  neutral: "#94a3b8",
  negative: "#ef4444",
};

/* ------------------------------------------------------------------ */
/*  Small helper components                                            */
/* ------------------------------------------------------------------ */

function SentimentBadge({ value }: { value: number }) {
  if (value > 10)
    return (
      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1">
        <TrendingUp className="h-3 w-3" />+{value}
      </Badge>
    );
  if (value < -10)
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 gap-1">
        <TrendingDown className="h-3 w-3" />
        {value}
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1">
      <Minus className="h-3 w-3" />
      {value}
    </Badge>
  );
}

function SentimentBar({
  positive,
  neutral,
  negative,
  total,
}: {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}) {
  if (total === 0) return <div className="h-2 rounded-full bg-muted" />;
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-muted">
      <div
        style={{
          width: `${(positive / total) * 100}%`,
          backgroundColor: SENTIMENT_COLORS.positive,
        }}
      />
      <div
        style={{
          width: `${(neutral / total) * 100}%`,
          backgroundColor: SENTIMENT_COLORS.neutral,
        }}
      />
      <div
        style={{
          width: `${(negative / total) * 100}%`,
          backgroundColor: SENTIMENT_COLORS.negative,
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function BrandSentimentPage() {
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SentimentDashboardData | null>(null);

  // Filters
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("90");

  // Entity detail dialog
  const [selectedEntity, setSelectedEntity] = useState<EntityData | null>(null);
  const [entityDetail, setEntityDetail] = useState<EntityDetail | null>(null);
  const [entityDetailLoading, setEntityDetailLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const days = parseInt(dateRange);
      const from = new Date(
        Date.now() - days * 86400000
      ).toISOString();
      params.set("from", from);
      if (topicFilter !== "all") params.set("topic", topicFilter);

      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/sov-sentiment?${params}`
      );
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Failed to load sentiment data");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, dateRange, topicFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchEntityDetail = useCallback(
    async (entity: EntityData) => {
      if (!activeWorkspace) return;
      setSelectedEntity(entity);
      setEntityDetailLoading(true);
      setEntityDetail(null);
      try {
        const params = new URLSearchParams();
        const days = parseInt(dateRange);
        params.set(
          "from",
          new Date(Date.now() - days * 86400000).toISOString()
        );
        const res = await fetch(
          `/api/workspaces/${activeWorkspace.id}/sov-sentiment/entity/${encodeURIComponent(entity.domain)}?${params}`
        );
        if (!res.ok) throw new Error();
        setEntityDetail(await res.json());
      } catch {
        toast.error("Failed to load entity detail");
      } finally {
        setEntityDetailLoading(false);
      }
    },
    [activeWorkspace, dateRange]
  );

  // ── CSV export ──────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!data) return;
    const rows = [
      [
        "Entity",
        "Domain",
        "SoV%",
        "Mentions",
        "Positive",
        "Neutral",
        "Negative",
        "Net Sentiment",
      ],
      ...data.entityComparison.map((e) => [
        e.name,
        e.domain,
        e.sov,
        e.mentions,
        e.positive,
        e.neutral,
        e.negative,
        e.netSentiment,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "brand-sentiment-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  // ── Build chart data ────────────────────────────────────────────
  const trendChartData = useMemo(() => {
    if (!data) return [];
    return data.dailyTrend.map((d) => ({
      ...d,
      date: new Date(d.date).toLocaleDateString("en", {
        month: "short",
        day: "numeric",
      }),
    }));
  }, [data]);

  const weeklyChartData = useMemo(() => {
    if (!data) return [];
    return data.weeklyTrend.map((w) => {
      const entry: Record<string, unknown> = {
        week: new Date(w.week).toLocaleDateString("en", {
          month: "short",
          day: "numeric",
        }),
      };
      for (const ent of w.entities) {
        entry[ent.name] = ent.sov;
      }
      return entry;
    });
  }, [data]);

  const sovPieData = useMemo(() => {
    if (!data) return [];
    return data.entityComparison.map((e) => ({
      name: e.name,
      value: e.sov,
      color: e.color,
    }));
  }, [data]);

  // ── Loading state ───────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={5} />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No data available. Configure tracked queries first.
      </div>
    );
  }

  const { overview } = data;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <PageHeader
        title="Brand Sentiment"
        description="Measure how Google AI Overviews mention your brand and the tone of those mentions over time."
        helpText="Track positive, neutral, and negative sentiment in AI responses. Compare your brand against competitors across topics."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!data}
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button
              size="sm"
              onClick={fetchData}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Refresh
            </Button>
          </div>
        }
      />

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>

        <Select value={topicFilter} onValueChange={setTopicFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All topics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All topics</SelectItem>
            {data.filters.topics.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Overview KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <MessageSquare className="h-3.5 w-3.5" />
              Total Mentions
            </div>
            <p className="text-2xl font-bold">
              {overview.totalMentions.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <ThumbsUp className="h-3.5 w-3.5 text-green-500" />
              Positive
            </div>
            <p className="text-2xl font-bold text-green-600">
              {overview.positivePercent}%
            </p>
            <p className="text-xs text-muted-foreground">
              {overview.positiveCount} mentions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <ThumbsDown className="h-3.5 w-3.5 text-red-500" />
              Negative
            </div>
            <p className="text-2xl font-bold text-red-600">
              {overview.negativePercent}%
            </p>
            <p className="text-xs text-muted-foreground">
              {overview.negativeCount} mentions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Activity className="h-3.5 w-3.5" />
              Net Sentiment
            </div>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{overview.netSentiment}</p>
              <SentimentBadge value={overview.netSentiment} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Eye className="h-3.5 w-3.5" />
              Entities Tracked
            </div>
            <p className="text-2xl font-bold">
              {overview.entitiesTracked}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Top Moving Themes ───────────────────────────────────────── */}
      {data.topMovingThemes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">
                Top Moving Themes
              </CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Topics with the biggest sentiment shift in the last 7 days
                    compared to the previous 7 days.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="flex flex-wrap gap-3">
              {data.topMovingThemes.slice(0, 6).map((theme) => (
                <div
                  key={theme.topic}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{theme.topic}</span>
                  <span
                    className={`flex items-center gap-0.5 text-xs font-semibold ${
                      theme.change > 0
                        ? "text-green-600"
                        : theme.change < 0
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {theme.change > 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : theme.change < 0 ? (
                      <ArrowDownRight className="h-3 w-3" />
                    ) : null}
                    {theme.change > 0 ? "+" : ""}
                    {theme.change}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Main Tabbed Content ─────────────────────────────────────── */}
      <Tabs defaultValue="trend" className="w-full">
        <TabsList>
          <TabsTrigger value="trend">Sentiment Trend</TabsTrigger>
          <TabsTrigger value="entities">Entity Comparison</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>

        {/* ── Tab: Sentiment Trend ──────────────────────────────────── */}
        <TabsContent value="trend" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sentiment Over Time</CardTitle>
              <CardDescription>
                Stacked area chart showing positive / neutral / negative share
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis />
                    <RTooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="positive"
                      stackId="1"
                      stroke={SENTIMENT_COLORS.positive}
                      fill={SENTIMENT_COLORS.positive}
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="neutral"
                      stackId="1"
                      stroke={SENTIMENT_COLORS.neutral}
                      fill={SENTIMENT_COLORS.neutral}
                      fillOpacity={0.4}
                    />
                    <Area
                      type="monotone"
                      dataKey="negative"
                      stackId="1"
                      stroke={SENTIMENT_COLORS.negative}
                      fill={SENTIMENT_COLORS.negative}
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground">
                  No trend data available for the selected period.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weekly SoV Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Weekly Share of Voice Trend</CardTitle>
              <CardDescription>
                12-week SoV trend by entity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" fontSize={12} />
                  <YAxis unit="%" />
                  <RTooltip />
                  <Legend />
                  {data.entityComparison.map((ent) => (
                    <Bar
                      key={ent.domain}
                      dataKey={ent.name}
                      fill={ent.color}
                      stackId="sov"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Entity Comparison ───────────────────────────────── */}
        <TabsContent value="entities" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SoV Pie */}
            <Card>
              <CardHeader>
                <CardTitle>Share of Voice</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={sovPieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={50}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}%`}
                    >
                      {sovPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <RTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Sentiment by Entity stacked bars */}
            <Card>
              <CardHeader>
                <CardTitle>Sentiment by Entity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.entityComparison.map((ent) => (
                    <div key={ent.domain}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: ent.color }}
                          />
                          <span className="font-medium text-sm">
                            {ent.name}
                          </span>
                          {ent.isBrand && (
                            <Badge variant="secondary" className="text-[10px] h-4">
                              Brand
                            </Badge>
                          )}
                        </div>
                        <SentimentBadge value={ent.netSentiment} />
                      </div>
                      <SentimentBar
                        positive={ent.positive}
                        neutral={ent.neutral}
                        negative={ent.negative}
                        total={ent.mentions}
                      />
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-green-600">
                          {ent.positive} pos
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {ent.neutral} neu
                        </span>
                        <span className="text-xs text-red-600">
                          {ent.negative} neg
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {ent.mentions} mentions
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Entity Table with drill-down */}
          <Card>
            <CardHeader>
              <CardTitle>Entity Breakdown</CardTitle>
              <CardDescription>
                Click an entity to see detailed sentiment analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead className="text-center">SoV</TableHead>
                    <TableHead className="text-center">Mentions</TableHead>
                    <TableHead className="text-center">Positive</TableHead>
                    <TableHead className="text-center">Negative</TableHead>
                    <TableHead className="text-center">
                      Net Sentiment
                    </TableHead>
                    <TableHead className="text-center">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.entityComparison.map((ent) => (
                    <TableRow key={ent.domain}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: ent.color }}
                          />
                          <div>
                            <span className="font-medium">{ent.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {ent.domain}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={ent.sov >= 30 ? "default" : "outline"}
                        >
                          {ent.sov}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {ent.mentions}
                      </TableCell>
                      <TableCell className="text-center text-green-600">
                        {ent.positivePercent}%
                      </TableCell>
                      <TableCell className="text-center text-red-600">
                        {ent.negativePercent}%
                      </TableCell>
                      <TableCell className="text-center">
                        <SentimentBadge value={ent.netSentiment} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => fetchEntityDetail(ent)}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>
                                {selectedEntity?.name} — Sentiment Detail
                              </DialogTitle>
                              <DialogDescription>
                                Per-entity trend, topics, exemplar responses,
                                and top citation domains.
                              </DialogDescription>
                            </DialogHeader>

                            {entityDetailLoading ? (
                              <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                              </div>
                            ) : entityDetail ? (
                              <EntityDetailView detail={entityDetail} />
                            ) : null}
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Topics ──────────────────────────────────────────── */}
        <TabsContent value="topics">
          <Card>
            <CardHeader>
              <CardTitle>Sentiment by Topic</CardTitle>
              <CardDescription>
                Which themes drive positive or negative sentiment
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.topicBreakdown.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Topic</TableHead>
                      <TableHead className="text-center">Mentions</TableHead>
                      <TableHead>Sentiment Split</TableHead>
                      <TableHead className="text-center">
                        Net Sentiment
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topicBreakdown.map((t) => (
                      <TableRow key={t.topic}>
                        <TableCell className="font-medium">
                          {t.topic}
                        </TableCell>
                        <TableCell className="text-center">
                          {t.total}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <SentimentBar
                              positive={t.positive}
                              neutral={t.neutral}
                              negative={t.negative}
                              total={t.total}
                            />
                            <div className="flex gap-2 text-xs text-muted-foreground">
                              <span className="text-green-600">
                                {t.positive}
                              </span>
                              <span>{t.neutral}</span>
                              <span className="text-red-600">
                                {t.negative}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <SentimentBadge value={t.netSentiment} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  No topic data available. Add topics to your tracked queries.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Prompts ─────────────────────────────────────────── */}
        <TabsContent value="prompts">
          <Card>
            <CardHeader>
              <CardTitle>Top Prompts by Sentiment</CardTitle>
              <CardDescription>
                Prompts driving the most sentiment responses, with sample
                excerpts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.topPrompts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prompt</TableHead>
                      <TableHead className="text-center">Mentions</TableHead>
                      <TableHead>Sentiment</TableHead>
                      <TableHead className="text-center">Net</TableHead>
                      <TableHead>Sample</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topPrompts.map((p) => (
                      <TableRow key={p.queryId}>
                        <TableCell className="max-w-[200px]">
                          <p className="font-medium text-sm truncate">
                            {p.queryText}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          {p.total}
                        </TableCell>
                        <TableCell>
                          <SentimentBar
                            positive={p.positive}
                            neutral={p.neutral}
                            negative={p.negative}
                            total={p.total}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <SentimentBadge value={p.netSentiment} />
                        </TableCell>
                        <TableCell className="max-w-[250px]">
                          {p.sampleSnippets.length > 0 ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4 mr-1" />
                                  View
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>
                                    Sample Responses
                                  </DialogTitle>
                                  <DialogDescription>
                                    {p.queryText}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                                  {p.sampleSnippets.map((s, i) => (
                                    <div
                                      key={i}
                                      className="rounded-lg border p-3 text-sm text-muted-foreground"
                                    >
                                      {s}
                                    </div>
                                  ))}
                                </div>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  No prompt data available for the selected period.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Entity Detail View (shown in dialog)                               */
/* ------------------------------------------------------------------ */

function EntityDetailView({ detail }: { detail: EntityDetail }) {
  const { entity, dailyTrend, topicBreakdown, exemplarResponses, topCitationDomains } = detail;

  const trendData = dailyTrend.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString("en", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="space-y-6">
      {/* Entity KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-lg font-bold">{entity.totalMentions}</p>
          <p className="text-xs text-muted-foreground">Mentions</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-lg font-bold text-green-600">
            {entity.positive}
          </p>
          <p className="text-xs text-muted-foreground">Positive</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-lg font-bold text-red-600">{entity.negative}</p>
          <p className="text-xs text-muted-foreground">Negative</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-lg font-bold">{entity.netSentiment}</p>
          <p className="text-xs text-muted-foreground">Net Sentiment</p>
        </div>
      </div>

      {/* Entity trend chart */}
      {trendData.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Daily Trend</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={10} />
              <YAxis />
              <RTooltip />
              <Line
                type="monotone"
                dataKey="positive"
                stroke={SENTIMENT_COLORS.positive}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="negative"
                stroke={SENTIMENT_COLORS.negative}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <Separator />

      {/* Sentiment by Topic */}
      {topicBreakdown.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">
            Sentiment by Topic
          </h4>
          <div className="space-y-2">
            {topicBreakdown.slice(0, 8).map((t) => (
              <div key={t.topic}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>{t.topic}</span>
                  <SentimentBadge value={t.netSentiment} />
                </div>
                <SentimentBar
                  positive={t.positive}
                  neutral={t.neutral}
                  negative={t.negative}
                  total={t.total}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Top Citation Domains */}
      {topCitationDomains.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">
            Top Citation Domains
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {topCitationDomains.slice(0, 10).map((d) => (
              <div
                key={d.domain}
                className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
              >
                <span className="truncate">{d.domain}</span>
                <Badge variant="outline">{d.count}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Exemplar Responses */}
      {exemplarResponses.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">
            Sample Responses
          </h4>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {exemplarResponses.map((r, i) => (
              <div
                key={i}
                className="rounded-lg border p-3 space-y-1"
              >
                <div className="flex items-center gap-2 text-xs">
                  <Badge
                    className={
                      r.sentiment === "positive"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : r.sentiment === "negative"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : ""
                    }
                    variant={
                      r.sentiment === "neutral" ? "outline" : "default"
                    }
                  >
                    {r.sentiment}
                  </Badge>
                  <span className="text-muted-foreground">{r.date}</span>
                  {r.sourceUrl && (
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline flex items-center gap-0.5"
                    >
                      <ExternalLink className="h-3 w-3" />
                      source
                    </a>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.snippet || r.overviewExcerpt}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
