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
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  Link2,
  Search,
  Download,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Eye,
  Globe,
  TrendingUp,
  BarChart3,
  Shield,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface BacklinkDomain {
  domain: string;
  firstCitedUrl: string;
  citedUrls: string[];
  citationCount: number;
  citationsByEngine: Record<string, number>;
  brandMentions: number;
  sentimentCounts: Record<string, number>;
  dominantSentiment: string;
  distinctCitationDays: number;
  firstSeen: string;
  lastSeen: string;
  scoreCitationFreq: number;
  scoreTemporalConsistency: number;
  scoreBrandMentionRate: number;
  scoreSourceAuthority: number;
  scoreContextualRelevance: number;
  scoreSentimentImpact: number;
  scoreAiRelevance: number;
  qualityScore: number;
  qualityBucket: string;
  aiRelevancePercent: number;
  domainType: string;
  dailyCitations: Record<string, number>;
  sampleSnippet: string;
  topEngines: string[];
}

interface BacklinkSummary {
  totalSources: number;
  totalCitations: number;
  avgQuality: number;
  highQuality: number;
  mediumQuality: number;
  lowQuality: number;
  topEngine: string;
  qualityDistribution: Array<{ range: string; label: string; count: number }>;
  engineBreakdown: Array<{ engine: string; citations: number }>;
  sentimentTotals: Record<string, number>;
  domainTypeBreakdown: Array<{ type: string; count: number }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface DomainDetail {
  domain: string;
  evidence: Array<{
    trackingResultId: string;
    citedUrl: string;
    engine: string;
    excerpt: string;
    promptText: string;
    topic: string;
    sentiment: string;
    brandMentioned: boolean;
    sourcePosition: number;
    fetchedAt: string;
  }>;
  totalEvidence: number;
  timeline: Record<string, number>;
  engineBreakdown: Record<string, number>;
  sentimentBreakdown: Record<string, number>;
  citedUrls: Array<{ url: string; count: number }>;
  topPrompts: Array<{ prompt: string; count: number }>;
  metadata: {
    domainType: string;
    title: string;
    totalCitations: number;
    mentionedBrands: string[];
  };
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#22c55e",
  neutral: "#a3a3a3",
  negative: "#ef4444",
};

const QUALITY_COLORS: Record<string, string> = {
  high: "#22c55e",
  medium: "#eab308",
  low: "#ef4444",
};

const DOMAIN_TYPE_LABELS: Record<string, string> = {
  corporate: "Corporate",
  editorial: "Editorial",
  institutional: "Institutional",
  ugc: "UGC",
  reference: "Reference",
  competitor: "Competitor",
  other: "Other",
};

const PIE_COLORS = ["#6366f1", "#22c55e", "#eab308", "#ef4444", "#06b6d4", "#f97316", "#8b5cf6"];

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function qualityBadgeVariant(bucket: string) {
  if (bucket === "high")
    return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (bucket === "medium")
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
}

function qualityScoreColor(score: number) {
  if (score >= 85) return "text-green-600 dark:text-green-400";
  if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function sentimentBadge(s: string) {
  if (s === "positive")
    return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (s === "negative")
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
}

/** Build sparkline data from dailyCitations map */
function sparklineData(daily: Record<string, number>) {
  return Object.entries(daily)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

/** Quality gauge — simple horizontal bar */
function QualityGauge({ score, bucket }: { score: number; bucket: string }) {
  const color =
    bucket === "high"
      ? "bg-green-500"
      : bucket === "medium"
      ? "bg-yellow-500"
      : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className={`text-sm font-bold tabular-nums ${qualityScoreColor(score)}`}>
        {score}
      </span>
    </div>
  );
}

/** Score breakdown row */
function ScoreRow({
  label,
  value,
  weight,
}: {
  label: string;
  value: number;
  weight: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-44 text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-right font-medium tabular-nums">{pct}%</span>
      <span className="w-10 text-right text-xs text-muted-foreground">
        {weight}
      </span>
    </div>
  );
}

/* ================================================================== */
/*  Page Component                                                     */
/* ================================================================== */

export default function BacklinksPage() {
  const { activeWorkspace } = useWorkspace();

  /* ── List state ─────────────────────────────────────────────── */
  const [loading, setLoading] = useState(false);
  const [backlinks, setBacklinks] = useState<BacklinkDomain[]>([]);
  const [summary, setSummary] = useState<BacklinkSummary | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  /* ── Filters ────────────────────────────────────────────────── */
  const [days, setDays] = useState("90");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState("qualityScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  /* ── Domain drilldown ───────────────────────────────────────── */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<DomainDetail | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<BacklinkDomain | null>(null);
  const [detailTab, setDetailTab] = useState("overview");

  /* ── Debounce search ────────────────────────────────────────── */
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(id);
  }, [searchTerm]);

  /* ── Fetch list ─────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        days,
        page: String(currentPage),
        limit: "50",
        sort: sortField,
        sortDir: sortDir === "asc" ? "asc" : "desc",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (sentimentFilter !== "all") params.set("sentiment", sentimentFilter);

      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/backlinks?${params}`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBacklinks(data.backlinks ?? []);
      setSummary(data.summary ?? null);
      setPagination(data.pagination ?? null);
    } catch {
      toast.error("Failed to load backlink data");
    } finally {
      setLoading(false);
    }
  }, [
    activeWorkspace,
    days,
    currentPage,
    sortField,
    sortDir,
    debouncedSearch,
    sentimentFilter,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Toggle sort ────────────────────────────────────────────── */
  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: string }) =>
    sortField === field ? (
      sortDir === "asc" ? (
        <ChevronUp className="h-3 w-3" />
      ) : (
        <ChevronDown className="h-3 w-3" />
      )
    ) : null;

  /* ── Fetch domain detail ────────────────────────────────────── */
  const openDetail = async (bl: BacklinkDomain) => {
    setSelectedDomain(bl);
    setDetailOpen(true);
    setDetailTab("overview");
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace!.id}/backlinks/${encodeURIComponent(bl.domain)}?days=${days}`
      );
      if (!res.ok) throw new Error();
      setDetail(await res.json());
    } catch {
      toast.error("Failed to load domain details");
    } finally {
      setDetailLoading(false);
    }
  };

  /* ── CSV export ─────────────────────────────────────────────── */
  const exportCsv = useCallback(() => {
    if (!backlinks.length) return;
    const headers = [
      "Domain",
      "Quality Score",
      "Quality Bucket",
      "AI Relevance %",
      "Citations",
      "Brand Mentions",
      "Dominant Sentiment",
      "Domain Type",
      "First Seen",
      "Last Seen",
      "Citation Freq",
      "Temporal Consistency",
      "Brand Mention Rate",
      "Source Authority",
      "Contextual Relevance",
      "Sentiment Impact",
      "AI Relevance Score",
    ];
    const rows = backlinks.map((b) =>
      [
        b.domain,
        b.qualityScore,
        b.qualityBucket,
        b.aiRelevancePercent,
        b.citationCount,
        b.brandMentions,
        b.dominantSentiment,
        b.domainType,
        b.firstSeen,
        b.lastSeen,
        b.scoreCitationFreq,
        b.scoreTemporalConsistency,
        b.scoreBrandMentionRate,
        b.scoreSourceAuthority,
        b.scoreContextualRelevance,
        b.scoreSentimentImpact,
        b.scoreAiRelevance,
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backlinks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }, [backlinks]);

  /* ── Chart data ─────────────────────────────────────────────── */
  const qualityDistData = useMemo(
    () => summary?.qualityDistribution ?? [],
    [summary]
  );
  const sentimentPieData = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.sentimentTotals)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [summary]);
  const domainTypePieData = useMemo(
    () =>
      (summary?.domainTypeBreakdown ?? []).map((d) => ({
        name: DOMAIN_TYPE_LABELS[d.type] || d.type,
        value: d.count,
      })),
    [summary]
  );

  /* ── Detail timeline chart data ─────────────────────────────── */
  const detailTimelineData = useMemo(() => {
    if (!detail?.timeline) return [];
    return Object.entries(detail.timeline)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }, [detail]);

  /* ── Detail sentiment pie data ──────────────────────────────── */
  const detailSentimentPie = useMemo(() => {
    if (!detail?.sentimentBreakdown) return [];
    return Object.entries(detail.sentimentBreakdown)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [detail]);

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Citation Authority & Relevance"
        description="Enterprise-grade scoring of domains cited in Google AI Overviews — quality breakdown, evidence drill-down, and export."
        helpText="Each domain is scored on 7 weighted components: Citation Frequency (25%), Temporal Consistency (20%), Brand Mention Rate (15%), Source Authority (15%), Contextual Relevance (10%), Sentiment Impact (7.5%), and AI Relevance (7.5%). Quality buckets: High 85-100, Medium 60-84, Low <60."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={!backlinks.length}
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button size="sm" onClick={fetchData} disabled={loading}>
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

      {/* ── KPI Cards ──────────────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <Globe className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{summary.totalSources}</p>
              <p className="text-xs text-muted-foreground">Total Sources</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <Link2 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">
                {summary.totalCitations.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Total Citations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <BarChart3 className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="text-2xl font-bold">{summary.avgQuality}</p>
              <p className="text-xs text-muted-foreground">Avg Quality</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <Shield className="h-4 w-4 mx-auto mb-1 text-green-500" />
              <p className="text-2xl font-bold text-green-600">
                {summary.highQuality}
              </p>
              <p className="text-xs text-muted-foreground">High</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <TrendingUp className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
              <p className="text-2xl font-bold text-yellow-600">
                {summary.mediumQuality}
              </p>
              <p className="text-xs text-muted-foreground">Medium</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <Sparkles className="h-4 w-4 mx-auto mb-1 text-red-500" />
              <p className="text-2xl font-bold text-red-600">
                {summary.lowQuality}
              </p>
              <p className="text-xs text-muted-foreground">Low</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Overview Charts ────────────────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Quality Distribution */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Quality Distribution</CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={qualityDistData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {qualityDistData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={
                          QUALITY_COLORS[d.label.toLowerCase()] || "#6366f1"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Sentiment Pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sentiment Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 flex items-center justify-center">
              {sentimentPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={sentimentPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={55}
                      paddingAngle={3}
                    >
                      {sentimentPieData.map((d) => (
                        <Cell
                          key={d.name}
                          fill={SENTIMENT_COLORS[d.name] || "#a3a3a3"}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground">No data</p>
              )}
              <div className="flex flex-col gap-1 text-xs ml-2">
                {sentimentPieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          SENTIMENT_COLORS[d.name] || "#a3a3a3",
                      }}
                    />
                    <span className="capitalize">{d.name}</span>
                    <span className="font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Domain Type Pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Source Types</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 flex items-center justify-center">
              {domainTypePieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={domainTypePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={55}
                      paddingAngle={3}
                    >
                      {domainTypePieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground">No data</p>
              )}
              <div className="flex flex-col gap-1 text-xs ml-2">
                {domainTypePieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                      }}
                    />
                    <span>{d.name}</span>
                    <span className="font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Filters Bar ────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search domains…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {/* Time range */}
            <Select value={days} onValueChange={(v) => { setDays(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="180">180 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
              </SelectContent>
            </Select>

            {/* Sentiment */}
            <Select value={sentimentFilter} onValueChange={(v) => { setSentimentFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue placeholder="All Sentiments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sentiments</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Results Table ──────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Citation Sources</CardTitle>
                <CardDescription>
                  {pagination
                    ? `${pagination.total} domains found — page ${pagination.page} of ${pagination.totalPages}`
                    : "Domains citing your brand in AI responses"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {backlinks.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                No backlink sources found. Track more queries to discover
                citation sources.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer select-none"
                          onClick={() => toggleSort("domain")}
                        >
                          <span className="flex items-center gap-1">
                            Domain <SortIcon field="domain" />
                          </span>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none text-center"
                          onClick={() => toggleSort("qualityScore")}
                        >
                          <span className="flex items-center justify-center gap-1">
                            Quality <SortIcon field="qualityScore" />
                          </span>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none text-center"
                          onClick={() => toggleSort("aiRelevancePercent")}
                        >
                          <span className="flex items-center justify-center gap-1">
                            AI Relevance <SortIcon field="aiRelevancePercent" />
                          </span>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer select-none text-center"
                          onClick={() => toggleSort("citationCount")}
                        >
                          <span className="flex items-center justify-center gap-1">
                            Citations <SortIcon field="citationCount" />
                          </span>
                        </TableHead>
                        <TableHead className="text-center">Trend</TableHead>
                        <TableHead className="text-center">Sentiment</TableHead>
                        <TableHead
                          className="cursor-pointer select-none text-center"
                          onClick={() => toggleSort("firstSeen")}
                        >
                          <span className="flex items-center justify-center gap-1">
                            First Seen <SortIcon field="firstSeen" />
                          </span>
                        </TableHead>
                        <TableHead className="text-center">Type</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backlinks.map((bl) => {
                        const spark = sparklineData(bl.dailyCitations);
                        return (
                          <TableRow
                            key={bl.domain}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => openDetail(bl)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <div>
                                  <p className="font-medium truncate max-w-[200px]">
                                    {bl.domain}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <QualityGauge
                                score={bl.qualityScore}
                                bucket={bl.qualityBucket}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="font-medium">
                                      {bl.aiRelevancePercent}%
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    AI relevance score
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell className="text-center font-medium tabular-nums">
                              {bl.citationCount}
                            </TableCell>
                            <TableCell>
                              <div className="w-20 h-6 mx-auto">
                                {spark.length > 1 ? (
                                  <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                  >
                                    <AreaChart data={spark}>
                                      <Area
                                        type="monotone"
                                        dataKey="count"
                                        stroke="#6366f1"
                                        fill="#6366f1"
                                        fillOpacity={0.15}
                                        strokeWidth={1.5}
                                      />
                                    </AreaChart>
                                  </ResponsiveContainer>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                className={`capitalize ${sentimentBadge(bl.dominantSentiment)}`}
                              >
                                {bl.dominantSentiment}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground text-sm">
                              {fmtDate(bl.firstSeen)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-xs capitalize">
                                {DOMAIN_TYPE_LABELS[bl.domainType] || bl.domainType}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDetail(bl);
                                    }}
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(
                                        bl.firstCitedUrl,
                                        "_blank"
                                      );
                                    }}
                                  >
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Open Source
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {(pagination.page - 1) * pagination.limit + 1}–
                      {Math.min(
                        pagination.page * pagination.limit,
                        pagination.total
                      )}{" "}
                      of {pagination.total}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      {Array.from(
                        { length: Math.min(pagination.totalPages, 5) },
                        (_, i) => {
                          let pageNum: number;
                          if (pagination.totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (
                            currentPage >= pagination.totalPages - 2
                          ) {
                            pageNum = pagination.totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={
                                pageNum === currentPage
                                  ? "default"
                                  : "outline"
                              }
                              size="icon"
                              className="h-7 w-7 text-xs"
                              onClick={() => setCurrentPage(pageNum)}
                            >
                              {pageNum}
                            </Button>
                          );
                        }
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={currentPage >= (pagination?.totalPages ?? 1)}
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
      )}

      {/* ── Domain Detail Dialog ───────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {selectedDomain?.domain}
            </DialogTitle>
            <DialogDescription>
              {selectedDomain &&
                `Quality Score ${selectedDomain.qualityScore} · ${selectedDomain.citationCount} citations`}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detail && selectedDomain ? (
            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="prompts">Top Prompts</TabsTrigger>
              </TabsList>

              {/* ── Overview Tab ─────────────────────────────────── */}
              <TabsContent value="overview" className="space-y-5">
                {/* Quality Gauge + Badge */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <QualityGauge
                      score={selectedDomain.qualityScore}
                      bucket={selectedDomain.qualityBucket}
                    />
                  </div>
                  <Badge
                    className={`text-sm px-3 py-1 ${qualityBadgeVariant(selectedDomain.qualityBucket)}`}
                  >
                    {selectedDomain.qualityBucket.toUpperCase()}
                  </Badge>
                </div>

                <Separator />

                {/* Score Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Score Breakdown</h4>
                  <ScoreRow
                    label="Citation Frequency"
                    value={selectedDomain.scoreCitationFreq}
                    weight="25%"
                  />
                  <ScoreRow
                    label="Temporal Consistency"
                    value={selectedDomain.scoreTemporalConsistency}
                    weight="20%"
                  />
                  <ScoreRow
                    label="Brand Mention Rate"
                    value={selectedDomain.scoreBrandMentionRate}
                    weight="15%"
                  />
                  <ScoreRow
                    label="Source Authority"
                    value={selectedDomain.scoreSourceAuthority}
                    weight="15%"
                  />
                  <ScoreRow
                    label="Contextual Relevance"
                    value={selectedDomain.scoreContextualRelevance}
                    weight="10%"
                  />
                  <ScoreRow
                    label="Sentiment Impact"
                    value={selectedDomain.scoreSentimentImpact}
                    weight="7.5%"
                  />
                  <ScoreRow
                    label="AI Relevance"
                    value={selectedDomain.scoreAiRelevance}
                    weight="7.5%"
                  />
                </div>

                <Separator />

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Domain Type</p>
                    <p className="font-medium capitalize">
                      {DOMAIN_TYPE_LABELS[detail.metadata.domainType] ||
                        detail.metadata.domainType}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">AI Relevance</p>
                    <p className="font-medium">
                      {selectedDomain.aiRelevancePercent}%
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">First Seen</p>
                    <p className="font-medium">
                      {fmtDate(selectedDomain.firstSeen)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Seen</p>
                    <p className="font-medium">
                      {fmtDate(selectedDomain.lastSeen)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Distinct Citation Days</p>
                    <p className="font-medium">
                      {selectedDomain.distinctCitationDays}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Brand Mentions</p>
                    <p className="font-medium">{selectedDomain.brandMentions}</p>
                  </div>
                </div>

                <Separator />

                {/* Sentiment mini chart */}
                <div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">
                      Sentiment Breakdown
                    </h4>
                    {detailSentimentPie.length > 0 ? (
                      <ResponsiveContainer width="100%" height={120}>
                        <PieChart>
                          <Pie
                            data={detailSentimentPie}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={25}
                            outerRadius={45}
                            paddingAngle={3}
                          >
                            {detailSentimentPie.map((d) => (
                              <Cell
                                key={d.name}
                                fill={
                                  SENTIMENT_COLORS[d.name] || "#a3a3a3"
                                }
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-xs text-muted-foreground">No data</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs mt-1">
                      {detailSentimentPie.map((d) => (
                        <span key={d.name} className="flex items-center gap-1">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor:
                                SENTIMENT_COLORS[d.name] || "#a3a3a3",
                            }}
                          />
                          <span className="capitalize">{d.name}</span>: {d.value}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Cited URLs */}
                {detail.citedUrls.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-semibold mb-2">
                        Cited URLs ({detail.citedUrls.length})
                      </h4>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {detail.citedUrls.map((u) => (
                          <div
                            key={u.url}
                            className="flex items-center justify-between text-xs"
                          >
                            <a
                              href={u.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline truncate max-w-[80%]"
                            >
                              {u.url}
                            </a>
                            <Badge variant="secondary" className="text-xs">
                              {u.count}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ── Evidence Tab ─────────────────────────────────── */}
              <TabsContent value="evidence" className="space-y-3">
                {detail.evidence.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No evidence records found.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                    {detail.evidence.map((ev, i) => (
                      <Card key={i} className="border">
                        <CardContent className="pt-4 pb-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge
                                className={`text-xs capitalize ${sentimentBadge(ev.sentiment)}`}
                              >
                                {ev.sentiment}
                              </Badge>
                              {ev.brandMentioned && (
                                <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 text-xs">
                                  Brand Mentioned
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {fmtDate(ev.fetchedAt)}
                            </span>
                          </div>
                          {ev.promptText && (
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Prompt
                              </p>
                              <p className="text-sm font-medium">
                                {ev.promptText}
                              </p>
                            </div>
                          )}
                          {ev.excerpt && (
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Excerpt
                              </p>
                              <p className="text-sm italic text-muted-foreground">
                                &ldquo;{ev.excerpt}&rdquo;
                              </p>
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>Position: #{ev.sourcePosition || "—"}</span>
                            {ev.topic && <span>Topic: {ev.topic}</span>}
                            <a
                              href={ev.citedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline ml-auto truncate max-w-[40%]"
                            >
                              {ev.citedUrl}
                            </a>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {detail.totalEvidence > detail.evidence.length && (
                      <p className="text-xs text-center text-muted-foreground">
                        Showing {detail.evidence.length} of{" "}
                        {detail.totalEvidence} evidence records
                      </p>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* ── Timeline Tab ─────────────────────────────────── */}
              <TabsContent value="timeline" className="space-y-4">
                {detailTimelineData.length > 1 ? (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">
                      Daily Citations Over Time
                    </h4>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={detailTimelineData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          className="opacity-30"
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d: string) =>
                            new Date(d).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                          }
                        />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Line
                          type="monotone"
                          dataKey="count"
                          stroke="#6366f1"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Not enough data for a timeline chart.
                  </p>
                )}
              </TabsContent>

              {/* ── Top Prompts Tab ──────────────────────────────── */}
              <TabsContent value="prompts" className="space-y-3">
                {detail.topPrompts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No prompt data available.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prompt</TableHead>
                        <TableHead className="text-center w-24">
                          Citations
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.topPrompts.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">
                            {p.prompt}
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {p.count}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No detail data available.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
