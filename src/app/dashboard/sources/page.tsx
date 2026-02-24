"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Globe,
  TrendingUp,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Target,
  Link2,
  BarChart3,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  StatGridSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/loading-skeletons";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  type PieLabelRenderProps,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────

interface DomainItem {
  domain: string;
  domainType: string;
  totalUrls: number;
  usedPercent: number;
  avgCitations: number;
  usedTotal: number;
  totalCitations: number;
  engines: string[];
  lastSeenAt: string;
  queryCount: number;
  gapScore: number;
  gapQueryCount: number;
  gapCompetitors: string[];
}

interface UrlItem {
  id: string;
  url: string;
  domain: string;
  title: string;
  urlType: string;
  domainType: string;
  usedTotal: number;
  avgCitations: number;
  totalCitations: number;
  engines: string[];
  lastSeenAt: string;
  lastFetchedAt: string | null;
  gapScore: number;
  gapQueryCount: number;
  gapCompetitors: string[];
}

interface Pagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

interface Summary {
  totalDomains?: number;
  totalSources?: number;
  totalUrls?: number;
  totalCitations: number;
  totalResponses: number;
  totalGapQueries?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

const DOMAIN_TYPE_LABELS: Record<string, string> = {
  you: "You",
  corporate: "Corporate",
  editorial: "Editorial",
  institutional: "Institutional",
  ugc: "UGC",
  reference: "Reference",
  competitor: "Competitor",
  other: "Other",
};

const URL_TYPE_LABELS: Record<string, string> = {
  homepage: "Homepage",
  category_page: "Category Page",
  product_page: "Product Page",
  listicle: "Listicle",
  comparison: "Comparison",
  profile: "Profile",
  alternative: "Alternative",
  discussion: "Discussion",
  how_to_guide: "How-to Guide",
  article: "Article",
  other: "Other",
};

const DOMAIN_TYPE_COLORS: Record<string, string> = {
  you: "#22c55e",
  corporate: "#3b82f6",
  editorial: "#8b5cf6",
  institutional: "#f59e0b",
  ugc: "#ef4444",
  reference: "#06b6d4",
  competitor: "#f97316",
  other: "#6b7280",
};

const CHART_COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(262, 83%, 58%)",
  "hsl(25, 95%, 53%)",
  "hsl(0, 84%, 60%)",
];

const TIME_RANGES = [
  { label: "7 days", value: "7" },
  { label: "14 days", value: "14" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
];

// ─── Badge Helpers ──────────────────────────────────────────────────────

function DomainTypeBadge({ type }: { type: string }) {
  const label = DOMAIN_TYPE_LABELS[type] || type;
  const color = DOMAIN_TYPE_COLORS[type] || DOMAIN_TYPE_COLORS.other;

  return (
    <Badge
      variant="outline"
      className="text-xs font-medium"
      style={{ borderColor: color, color }}
    >
      {label}
    </Badge>
  );
}

function UrlTypeBadge({ type }: { type: string }) {
  const label = URL_TYPE_LABELS[type] || type;
  return (
    <Badge variant="secondary" className="text-xs">
      {label}
    </Badge>
  );
}

// ─── Component ──────────────────────────────────────────────────────────

// (removed RecommendationsWidget here; dashboard will render the recommendations widget)

export default function SourcesPage() {
  const { activeWorkspace } = useWorkspace();

  // View state
  const [activeTab, setActiveTab] = useState<"domains" | "urls">("domains");
  const [days, setDays] = useState("7");
  const [gapAnalysis, setGapAnalysis] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [domainTypeFilter, setDomainTypeFilter] = useState("__all__");
  const [urlTypeFilter, setUrlTypeFilter] = useState("__all__");
  const [currentPage, setCurrentPage] = useState(1);

  // Data state
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [urls, setUrls] = useState<UrlItem[]>([]);
  const [typeDistribution, setTypeDistribution] = useState<
    Record<string, number>
  >({});
  const [trend, setTrend] = useState<Record<string, unknown>[]>([]);
  const [trendKeys, setTrendKeys] = useState<string[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        view: activeTab,
        days,
        page: currentPage.toString(),
        limit: "50",
      });

      if (gapAnalysis) params.set("gap", "1");
      if (searchText) params.set("search", searchText);

      if (activeTab === "domains" && domainTypeFilter !== "__all__") {
        params.set("domainType", domainTypeFilter);
      }
      if (activeTab === "urls" && urlTypeFilter !== "__all__") {
        params.set("urlType", urlTypeFilter);
      }

      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/sources?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch sources");

      const data = await res.json();

      setSummary(data.summary);
      setTypeDistribution(data.typeDistribution || {});
      setTrend(data.trend || []);
      setPagination(data.pagination);

      if (data.view === "domains") {
        setDomains(data.domains || []);
        setTrendKeys(data.top5Domains || []);
      } else {
        setUrls(data.urls || []);
        setTrendKeys(data.top5Labels || []);
      }
    } catch {
      toast.error("Failed to load sources data");
    } finally {
      setLoading(false);
    }
  }, [
    activeWorkspace?.id,
    activeTab,
    days,
    gapAnalysis,
    searchText,
    domainTypeFilter,
    urlTypeFilter,
    currentPage,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, days, gapAnalysis, searchText, domainTypeFilter, urlTypeFilter]);

  // ── Loading ───────────────────────────────────────────────────────────

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Sources"
          description="Discover which websites AI models trust and how they influence responses"
        />
        <StatGridSkeleton count={4} />
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton height="h-[250px]" />
        </div>
        <TableSkeleton rows={8} cols={6} />
      </div>
    );
  }

  // ── Charts Data ───────────────────────────────────────────────────────

  const pieData = Object.entries(typeDistribution).map(([name, value]) => ({
    name:
      activeTab === "domains"
        ? DOMAIN_TYPE_LABELS[name] || name
        : URL_TYPE_LABELS[name] || name,
    value,
    fill:
      activeTab === "domains"
        ? DOMAIN_TYPE_COLORS[name] || DOMAIN_TYPE_COLORS.other
        : CHART_COLORS[
            Object.keys(typeDistribution).indexOf(name) % CHART_COLORS.length
          ],
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sources"
        description="Discover which websites AI models trust and how they influence responses"
        helpText="Sources are all URLs AI models access during response generation. Citations are sources explicitly referenced in the response text."
        actions={
          <div className="flex items-center gap-3">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              Unique Domains
            </CardDescription>
            <CardTitle className="text-2xl">
              {summary?.totalDomains ?? summary?.totalUrls ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Link2 className="h-3 w-3" />
              Total Sources
            </CardDescription>
            <CardTitle className="text-2xl">
              {summary?.totalSources ?? summary?.totalUrls ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              Total Citations
            </CardDescription>
            <CardTitle className="text-2xl">
              {summary?.totalCitations ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              AI Responses
            </CardDescription>
            <CardTitle className="text-2xl">
              {summary?.totalResponses ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "domains" | "urls")}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList>
            <TabsTrigger value="domains" className="gap-1.5">
              <Globe className="h-4 w-4" />
              Domains
            </TabsTrigger>
            <TabsTrigger value="urls" className="gap-1.5">
              <Link2 className="h-4 w-4" />
              URLs
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="gap-analysis"
                checked={gapAnalysis}
                onCheckedChange={setGapAnalysis}
              />
              <Label
                htmlFor="gap-analysis"
                className="text-sm flex items-center gap-1 cursor-pointer"
              >
                <Target className="h-3.5 w-3.5" />
                Gap Analysis
              </Label>
            </div>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid gap-4 lg:grid-cols-2 mt-4">
          {/* Usage Trend Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Source Usage by {activeTab === "domains" ? "Domain" : "URL"}
              </CardTitle>
              <CardDescription className="text-xs">
                Top 5 {activeTab === "domains" ? "domains" : "URLs"} over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(v: string) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                      fontSize={11}
                      className="fill-muted-foreground"
                    />
                    <YAxis fontSize={11} className="fill-muted-foreground" />
                    <RechartsTooltip
                      contentStyle={{
                        fontSize: 12,
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {trendKeys.map((key, i) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        name={key.length > 25 ? key.substring(0, 25) + "…" : key}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                  No trend data available yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Type Distribution Pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Sources Type Distribution</CardTitle>
              <CardDescription className="text-xs">
                Citations by {activeTab === "domains" ? "domain" : "URL"} category
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={(props: PieLabelRenderProps) =>
                        `${props.name ?? ""} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                      fontSize={11}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        fontSize: 12,
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                  No type data available
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                activeTab === "domains"
                  ? "Search domains..."
                  : "Search URLs or titles..."
              }
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9"
            />
          </div>

          {activeTab === "domains" ? (
            <Select
              value={domainTypeFilter}
              onValueChange={setDomainTypeFilter}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Domain Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Domain Types</SelectItem>
                {Object.entries(DOMAIN_TYPE_LABELS)
                  .filter(([k]) => k !== "you")
                  .map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={urlTypeFilter} onValueChange={setUrlTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All URL Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All URL Types</SelectItem>
                {Object.entries(URL_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* ── Domains Tab ──────────────────────────────────────────── */}
        <TabsContent value="domains" className="mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    {gapAnalysis
                      ? "Domain Gap Opportunities"
                      : "Source Domains"}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {gapAnalysis
                      ? `Sources from queries where competitors are cited but you aren't — ${summary?.totalGapQueries || 0} gap quer${(summary?.totalGapQueries || 0) === 1 ? "y" : "ies"} found`
                      : "All domains contributing to AI responses for your tracked prompts"}
                  </CardDescription>
                </div>
                {pagination && (
                  <span className="text-xs text-muted-foreground">
                    {pagination.totalItems} domain
                    {pagination.totalItems !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {domains.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Globe className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">
                    {gapAnalysis
                      ? "No gap opportunities found"
                      : "No source data yet"}
                  </p>
                  <p className="text-xs mt-1">
                    {gapAnalysis
                      ? "Try expanding the time range or disabling gap analysis"
                      : "Fetch some queries to populate source analysis"}
                  </p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-center">Domain Type</TableHead>
                        <TableHead className="text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="flex items-center gap-1 mx-auto">
                                Used
                                <Info className="h-3 w-3" />
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="max-w-xs text-xs"
                              >
                                Percentage of AI responses where this domain
                                contributed, even without a direct citation
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableHead>
                        <TableHead className="text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="flex items-center gap-1 mx-auto">
                                Avg. Citations
                                <Info className="h-3 w-3" />
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="max-w-xs text-xs"
                              >
                                Average number of times this domain was
                                explicitly cited when used
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableHead>
                        {gapAnalysis && (
                          <TableHead className="text-right">
                            Gap Score
                          </TableHead>
                        )}
                        {gapAnalysis && (
                          <TableHead>
                            Gap Competitors
                          </TableHead>
                        )}
                        <TableHead className="text-right">URLs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {domains.map((d) => (
                        <TableRow key={d.domain}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=16`}
                                alt=""
                                className="h-4 w-4 rounded-sm"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                              {d.domain}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <DomainTypeBadge type={d.domainType} />
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {d.usedPercent}%
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">
                            {d.avgCitations.toFixed(2)}
                          </TableCell>
                          {gapAnalysis && (
                            <TableCell className="text-right">
                              <Badge
                                variant={
                                  d.gapScore > 5
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {d.gapScore}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground ml-1">
                                ({d.gapQueryCount} quer{d.gapQueryCount === 1 ? "y" : "ies"})
                              </span>
                            </TableCell>
                          )}
                          {gapAnalysis && (
                            <TableCell>
                              <div className="flex flex-wrap gap-1 max-w-[150px]">
                                {d.gapCompetitors.length > 0
                                  ? d.gapCompetitors.map((c) => (
                                      <Badge
                                        key={c}
                                        variant="outline"
                                        className="text-[10px] px-1.5"
                                      >
                                        {c}
                                      </Badge>
                                    ))
                                  : <span className="text-xs text-muted-foreground">—</span>
                                }
                              </div>
                            </TableCell>
                          )}
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {d.totalUrls}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between border-t px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pagination.page <= 1}
                          onClick={() =>
                            setCurrentPage((p) => Math.max(1, p - 1))
                          }
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pagination.page >= pagination.totalPages}
                          onClick={() => setCurrentPage((p) => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── URLs Tab ─────────────────────────────────────────────── */}
        <TabsContent value="urls" className="mt-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    {gapAnalysis ? "URL Gap Opportunities" : "Source URLs"}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {gapAnalysis
                      ? `Pages cited in queries where competitors appear but you don't — ${summary?.totalGapQueries || 0} gap quer${(summary?.totalGapQueries || 0) === 1 ? "y" : "ies"} found`
                      : "Exact pages used as sources in AI responses"}
                  </CardDescription>
                </div>
                {pagination && (
                  <span className="text-xs text-muted-foreground">
                    {pagination.totalItems} URL
                    {pagination.totalItems !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {urls.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Link2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">
                    {gapAnalysis
                      ? "No URL gap opportunities found"
                      : "No URL data yet"}
                  </p>
                  <p className="text-xs mt-1">
                    {gapAnalysis
                      ? "Try expanding the time range or disabling gap analysis"
                      : "Fetch some queries to populate URL analysis"}
                  </p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[250px]">URL</TableHead>
                        <TableHead>URL Type</TableHead>
                        <TableHead>{gapAnalysis ? "Gap Competitors" : "Competitors"}</TableHead>
                        <TableHead className="text-right">
                          Used Total
                        </TableHead>
                        <TableHead className="text-right">
                          Avg. Citations
                        </TableHead>
                        {gapAnalysis && (
                          <TableHead className="text-right">
                            Gap Score
                          </TableHead>
                        )}
                        <TableHead>Updated</TableHead>
                        <TableHead className="w-[40px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {urls.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div className="space-y-0.5 max-w-[350px]">
                              <div className="flex items-center gap-1.5">
                                <img
                                  src={`https://www.google.com/s2/favicons?domain=${u.domain}&sz=16`}
                                  alt=""
                                  className="h-4 w-4 rounded-sm flex-shrink-0"
                                  onError={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                                <span
                                  className="text-sm font-medium truncate"
                                  title={u.title || u.url}
                                >
                                  {u.title || u.domain}
                                </span>
                              </div>
                              <p
                                className="text-xs text-muted-foreground truncate"
                                title={u.url}
                              >
                                {u.url.replace(/^https?:\/\//, "").substring(0, 60)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <UrlTypeBadge type={u.urlType} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[150px]">
                              {u.gapCompetitors.length > 0 ? (
                                u.gapCompetitors.slice(0, 3).map((b) => (
                                  <Badge
                                    key={b}
                                    variant="outline"
                                    className="text-[10px] px-1.5"
                                  >
                                    {b.length > 15
                                      ? b.substring(0, 15) + "…"
                                      : b}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )}
                              {u.gapCompetitors.length > 3 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5"
                                >
                                  +{u.gapCompetitors.length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {u.usedTotal}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {u.avgCitations.toFixed(2)}
                          </TableCell>
                          {gapAnalysis && (
                            <TableCell className="text-right">
                              <Badge
                                variant={
                                  u.gapScore > 5
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {u.gapScore}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground ml-1">
                                ({u.gapQueryCount} quer{u.gapQueryCount === 1 ? "y" : "ies"})
                              </span>
                            </TableCell>
                          )}
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {u.lastSeenAt
                              ? new Date(u.lastSeenAt).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" }
                                )
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <a
                              href={u.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between border-t px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pagination.page <= 1}
                          onClick={() =>
                            setCurrentPage((p) => Math.max(1, p - 1))
                          }
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pagination.page >= pagination.totalPages}
                          onClick={() => setCurrentPage((p) => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
