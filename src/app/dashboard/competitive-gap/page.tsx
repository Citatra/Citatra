"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import {
  Card,
  CardContent,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Globe,
  Info,
  Lightbulb,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  StatGridSkeleton,
  TableSkeleton,
} from "@/components/loading-skeletons";
import { EmptyState } from "@/components/empty-state";

// ─── Types ──────────────────────────────────────────────────────────────

// Competitive Gap types
interface GapSource {
  url: string;
  title: string;
  domainType: string;
  urlType: string;
  lastSeenAt: string;
}

interface CompetitorHit {
  domain: string;
  name: string;
  citations: number;
  exampleUrl: string;
}

interface GapItem {
  id: string;
  type: "query" | "domain";
  queryText?: string;
  domain?: string;
  name?: string;
  topic?: string;
  queryCount?: number;
  queries?: string[];
  topCompetitorDomains: CompetitorHit[];
  opportunityScore: number;
  opportunityBucket: "high" | "medium" | "low";
  recentCitations: number;
  engines: string[];
  topSources: GapSource[];
  suggestedAction: "Create content" | "Citation outreach" | "Syndicate";
  confidenceNotes: string;
  lastCheckedAt: string;
}

interface GapData {
  items: GapItem[];
  summary: {
    totalGaps: number;
    highPriority: number;
    avgOpportunityScore: number;
    brandDomain: string;
  };
  filters: {
    engines: string[];
    competitors: Array<{ name: string; domain: string }>;
  };
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

// Keyword Opportunity types
interface Opportunity {
  keyword: string;
  type: "gap" | "expansion" | "trending" | "long-tail";
  source: string;
  relevanceScore: number;
  currentVisibility: number;
  potentialImpact: "high" | "medium" | "low";
  suggestion: string;
}

interface OpportunitySummary {
  totalOpportunities: number;
  gaps: number;
  expansions: number;
  trending: number;
  longTail: number;
  highImpact: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
];

const SORT_OPTIONS = [
  { label: "Opportunity Score", value: "opportunity_score" },
  { label: "Most Recent", value: "recency" },
  { label: "Most Citations", value: "citations" },
];

const DOMAIN_TYPE_LABELS: Record<string, string> = {
  corporate: "Corporate",
  editorial: "Editorial",
  institutional: "Institutional",
  ugc: "UGC",
  reference: "Reference",
  competitor: "Competitor",
  other: "Other",
};

const ACTION_STYLES: Record<string, { icon: typeof Zap; className: string }> = {
  "Create content": { icon: Sparkles, className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  "Citation outreach": { icon: ArrowUpRight, className: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
  Syndicate: { icon: Globe, className: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
};

const OPPORTUNITY_TYPE_CONFIG: Record<
  string,
  { icon: typeof Target; color: string; bg: string }
> = {
  gap: {
    icon: Target,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/50",
  },
  expansion: {
    icon: Sparkles,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-950/50",
  },
  trending: {
    icon: TrendingUp,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/50",
  },
  "long-tail": {
    icon: Search,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/50",
  },
};

// ─── Score Gauge Component ──────────────────────────────────────────────

function ScoreGauge({ score, bucket }: { score: number; bucket: string }) {
  const colors: Record<string, string> = {
    high: "text-green-600 dark:text-green-400",
    medium: "text-yellow-600 dark:text-yellow-400",
    low: "text-gray-400 dark:text-gray-500",
  };
  const bgColors: Record<string, string> = {
    high: "bg-green-100 dark:bg-green-950",
    medium: "bg-yellow-100 dark:bg-yellow-950",
    low: "bg-gray-100 dark:bg-gray-900",
  };
  const ringColors: Record<string, string> = {
    high: "stroke-green-500",
    medium: "stroke-yellow-500",
    low: "stroke-gray-300 dark:stroke-gray-600",
  };

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${bgColors[bucket]}`}>
      <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          transform="rotate(-90 24 24)"
          className={ringColors[bucket]}
        />
        <text
          x="24"
          y="24"
          textAnchor="middle"
          dominantBaseline="central"
          className={`text-xs font-bold fill-current ${colors[bucket]}`}
        >
          {score}
        </text>
      </svg>
      <div className="flex flex-col">
        <span className={`text-sm font-semibold ${colors[bucket]}`}>
          {bucket === "high" ? "High" : bucket === "medium" ? "Medium" : "Low"}
        </span>
        <span className="text-[10px] text-muted-foreground">Priority</span>
      </div>
    </div>
  );
}

// ─── Gap Card Component ─────────────────────────────────────────────────

function GapCard({ item }: { item: GapItem }) {
  const [expanded, setExpanded] = useState(false);
  const actionConfig = ACTION_STYLES[item.suggestedAction] || ACTION_STYLES["Create content"];
  const ActionIcon = actionConfig.icon;

  const displayTitle = item.type === "query" ? item.queryText : item.name || item.domain;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
          {/* Score Gauge */}
          <div className="shrink-0">
            <ScoreGauge score={item.opportunityScore} bucket={item.opportunityBucket} />
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm leading-tight truncate max-w-xl">
                  {displayTitle}
                </h3>
                {item.topic && (
                  <span className="text-[11px] text-muted-foreground">
                    Topic: {item.topic}
                  </span>
                )}
                {item.type === "domain" && item.queryCount && (
                  <span className="text-[11px] text-muted-foreground">
                    {item.queryCount} gap quer{item.queryCount === 1 ? "y" : "ies"}
                  </span>
                )}
              </div>

              {/* Suggested Action CTA */}
              <button
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${actionConfig.className}`}
              >
                <ActionIcon className="h-3.5 w-3.5" />
                {item.suggestedAction}
              </button>
            </div>

            {/* Competitors + Engines Row */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {/* Top Competitors */}
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                {item.topCompetitorDomains.slice(0, 3).map((c) => (
                  <TooltipProvider key={c.domain}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-[11px] font-normal gap-1">
                          {c.name}
                          <span className="text-muted-foreground">({c.citations})</span>
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {c.domain} — {c.citations} citation{c.citations !== 1 ? "s" : ""}
                        {c.exampleUrl && (
                          <span className="block text-[10px] text-muted-foreground truncate max-w-[200px]">
                            {c.exampleUrl}
                          </span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
                {item.topCompetitorDomains.length > 3 && (
                  <span className="text-[11px] text-muted-foreground">
                    +{item.topCompetitorDomains.length - 3} more
                  </span>
                )}
              </div>

              {/* Separator */}
              <span className="text-muted-foreground">·</span>

              {/* Citations count */}
              <span className="text-xs text-muted-foreground">
                {item.recentCitations} citation{item.recentCitations !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Confidence note */}
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
              <Info className="h-3 w-3" />
              {item.confidenceNotes}
            </p>

            {/* Evidence toggle */}
            {item.topSources.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-primary hover:underline mt-2 inline-flex items-center gap-1"
              >
                <Search className="h-3 w-3" />
                {expanded ? "Hide evidence" : `View evidence (${item.topSources.length} source${item.topSources.length !== 1 ? "s" : ""})`}
              </button>
            )}

            {/* Expanded evidence panel */}
            {expanded && (
              <div className="mt-3 rounded-lg border bg-muted/30 p-3 space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Competitor Sources
                </h4>
                {item.topSources.map((source) => (
                  <div
                    key={source.url}
                    className="flex items-start gap-2 text-xs"
                  >
                    <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline break-all leading-tight"
                      >
                        {source.title || source.url}
                      </a>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] py-0 px-1">
                          {DOMAIN_TYPE_LABELS[source.domainType] || source.domainType}
                        </Badge>
                        <span className="text-muted-foreground text-[10px]">
                          Last seen {new Date(source.lastSeenAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Opportunity Action Styles ───────────────────────────────────────────

const OPPORTUNITY_ACTION_STYLES: Record<string, { icon: typeof Zap; className: string; label: string }> = {
  gap: { icon: Target, className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300", label: "Address gap" },
  expansion: { icon: Sparkles, className: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300", label: "Expand content" },
  trending: { icon: TrendingUp, className: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300", label: "Double down" },
  "long-tail": { icon: Search, className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300", label: "Create content" },
};

// ─── Opportunity Card Component ─────────────────────────────────────────

function OpportunityCard({ opp }: { opp: Opportunity }) {
  const [expanded, setExpanded] = useState(false);
  const config = OPPORTUNITY_TYPE_CONFIG[opp.type] || OPPORTUNITY_TYPE_CONFIG.gap;
  const TypeIcon = config.icon;
  const actionConfig = OPPORTUNITY_ACTION_STYLES[opp.type] || OPPORTUNITY_ACTION_STYLES.gap;
  const ActionIcon = actionConfig.icon;

  const bucket = opp.potentialImpact === "high" ? "high" : opp.potentialImpact === "medium" ? "medium" : "low";

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
          {/* Score Gauge */}
          <div className="shrink-0">
            <ScoreGauge score={opp.relevanceScore} bucket={bucket} />
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm leading-tight truncate max-w-xl">
                  {opp.keyword}
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {opp.source}
                </span>
              </div>

              {/* Action CTA */}
              <button
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${actionConfig.className}`}
              >
                <ActionIcon className="h-3.5 w-3.5" />
                {actionConfig.label}
              </button>
            </div>

            {/* Type + Visibility Row */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <TypeIcon className={`h-3.5 w-3.5 ${config.color}`} />
                <Badge variant="outline" className="text-[11px] font-normal capitalize gap-1">
                  {opp.type === "long-tail" ? "Long-Tail" : opp.type}
                </Badge>
              </div>

              <span className="text-muted-foreground">·</span>

              <span className="text-xs text-muted-foreground">
                Relevance: {opp.relevanceScore}
              </span>

              {opp.currentVisibility > 0 && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    Visibility: {opp.currentVisibility}%
                  </span>
                </>
              )}
            </div>

            {/* Info note */}
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
              <Info className="h-3 w-3" />
              {opp.potentialImpact === "high"
                ? "High-impact opportunity — prioritise for immediate action"
                : opp.potentialImpact === "medium"
                  ? "Moderate opportunity — include in content roadmap"
                  : "Lower priority — monitor for future relevance"}
            </p>

            {/* Suggestion toggle */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-primary hover:underline mt-2 inline-flex items-center gap-1"
            >
              <Lightbulb className="h-3 w-3" />
              {expanded ? "Hide suggestion" : "View suggestion"}
            </button>

            {/* Expanded suggestion panel */}
            {expanded && (
              <div className="mt-3 rounded-lg border bg-muted/30 p-3 space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Recommendation
                </h4>
                <p className="text-sm text-foreground leading-relaxed">{opp.suggestion}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

type PageTab = "gaps" | "opportunities";

export default function CompetitiveGapPage() {
  const { activeWorkspace } = useWorkspace();

  // Top-level tab
  const [activeTab, setActiveTab] = useState<PageTab>("gaps");

  // ── Competitive Gap state ──
  const [gapLoading, setGapLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<GapData | null>(null);
  const [days, setDays] = useState("30");
  const [view, setView] = useState<"queries" | "domains">("queries");
  const [sort, setSort] = useState("opportunity_score");
  const [selectedCompetitor, setSelectedCompetitor] = useState<string>("all");
  const [selectedDomainType, setSelectedDomainType] = useState<string>("all");
  const [page, setPage] = useState(1);

  // ── Keyword Opportunity state ──
  const [kwLoading, setKwLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [kwSummary, setKwSummary] = useState<OpportunitySummary | null>(null);
  const [kwFilter, setKwFilter] = useState<"all" | "gap" | "expansion" | "trending" | "long-tail">("all");

  // ── Fetch competitive gap data ──
  const fetchGapData = useCallback(
    async (p = 1) => {
      if (!activeWorkspace) return;
      setGapLoading(true);
      try {
        const params = new URLSearchParams({
          days,
          view,
          sort,
          page: String(p),
          limit: "20",
        });
        if (selectedCompetitor !== "all") params.set("competitor", selectedCompetitor);
        if (selectedDomainType !== "all") params.set("domainType", selectedDomainType);

        const res = await fetch(
          `/api/workspaces/${activeWorkspace.id}/competitive-gap?${params}`
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        setData(json);
        setPage(p);
      } catch {
        toast.error("Failed to load competitive gap analysis");
      } finally {
        setGapLoading(false);
      }
    },
    [activeWorkspace, days, view, sort, selectedCompetitor, selectedDomainType]
  );

  // ── Fetch keyword opportunity data ──
  const fetchKwData = useCallback(async () => {
    if (!activeWorkspace) return;
    setKwLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/keyword-explorer`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setOpportunities(json.opportunities);
      setKwSummary(json.summary);
    } catch {
      toast.error("Failed to load keyword opportunities");
    } finally {
      setKwLoading(false);
    }
  }, [activeWorkspace]);

  // ── Load both datasets on mount ──
  useEffect(() => {
    fetchGapData(1);
  }, [fetchGapData]);

  useEffect(() => {
    fetchKwData();
  }, [fetchKwData]);

  const handleExport = async () => {
    if (!activeWorkspace) return;
    setExporting(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/competitive-gap`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            days: parseInt(days),
            view,
            competitor: selectedCompetitor !== "all" ? selectedCompetitor : undefined,
            domainType: selectedDomainType !== "all" ? selectedDomainType : undefined,
          }),
        }
      );
      if (!res.ok) {
        const msg = await res.json().catch(() => ({ error: "Export failed" }));
        throw new Error(msg.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `competitive-gap-${days}d.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // ── Derived values ──
  const { summary: gapSummary, filters, pagination } = data || {
    summary: { totalGaps: 0, highPriority: 0, avgOpportunityScore: 0, brandDomain: "" },
    filters: { engines: [], competitors: [] },
    pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
  };
  const gapItems = data?.items || [];
  const filteredOpps = opportunities.filter((o) => kwFilter === "all" || o.type === kwFilter);

  // ── Initial loading state ──
  const isInitialLoading = (activeTab === "gaps" && gapLoading && !data) ||
    (activeTab === "opportunities" && kwLoading && !kwSummary);

  if (isInitialLoading) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={3} />
        <TableSkeleton rows={6} cols={5} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <PageHeader
        title="AI Visibility Gap & Opportunity Analysis"
        description="Discover competitive citation gaps and keyword opportunities from AI overview analysis."
        helpText="Competitive Gaps: queries where competitors are cited but your domain isn't. Keyword Opportunities: semantic expansions, visibility trends, and content gaps from AI overviews."
        actions={
          <div className="flex items-center gap-2">
            {activeTab === "gaps" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting || gapItems.length === 0}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Export CSV
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => activeTab === "gaps" ? fetchGapData(1) : fetchKwData()}
              disabled={activeTab === "gaps" ? gapLoading : kwLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${(activeTab === "gaps" ? gapLoading : kwLoading) ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* ── Top-level Tab Switcher ─────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PageTab)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="gaps" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Competitive Gaps
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="gap-1.5">
            <Lightbulb className="h-4 w-4" />
            Keyword Opportunities
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ════════════════════════════════════════════════════════════════
          COMPETITIVE GAPS TAB
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === "gaps" && (
        <>
          {/* ── Summary KPIs ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Gaps</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{gapSummary.totalGaps}</div>
                <p className="text-xs text-muted-foreground">
                  Queries where you&apos;re absent but competitors are cited
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Priority</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{gapSummary.highPriority}</div>
                <p className="text-xs text-muted-foreground">
                  Gaps with opportunity score ≥ 80
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Opportunity Score</CardTitle>
                <Zap className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{gapSummary.avgOpportunityScore}</div>
                <p className="text-xs text-muted-foreground">
                  Across all detected gaps (0–100 scale)
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Controls ─────────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
                {/* View Toggle */}
                <Tabs
                  value={view}
                  onValueChange={(v) => setView(v as "queries" | "domains")}
                  className="shrink-0"
                >
                  <TabsList>
                    <TabsTrigger value="queries">Queries</TabsTrigger>
                    <TabsTrigger value="domains">Domains</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Date Range */}
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Time Range" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_RANGES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Sort */}
                <Select value={sort} onValueChange={setSort}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Competitor Filter */}
                {filters.competitors.length > 0 && (
                  <Select value={selectedCompetitor} onValueChange={setSelectedCompetitor}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Competitor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Competitors</SelectItem>
                      {filters.competitors.map((c) => (
                        <SelectItem key={c.domain} value={c.domain}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Domain Type Filter */}
                <Select value={selectedDomainType} onValueChange={setSelectedDomainType}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Domain Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="editorial">Editorial</SelectItem>
                    <SelectItem value="ugc">UGC</SelectItem>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* ── Loading overlay ──────────────────────────────────────── */}
          {gapLoading && data && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating…
            </div>
          )}

          {/* ── Gap Cards ────────────────────────────────────────────── */}
          {!gapLoading && gapItems.length === 0 && (
            <Card>
              <CardContent className="py-0">
                <EmptyState
                  icon={Search}
                  title="No competitive gaps found"
                  description="No queries were found where competitors are cited but your domain is missing. This could mean your domain is well-covered, or you may need to add competitors and tracked queries first."
                  action={
                    <Button variant="outline" size="sm" onClick={() => fetchGapData(1)}>
                      Refresh
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {gapItems.map((item) => (
              <GapCard key={item.id} item={item} />
            ))}
          </div>

          {/* ── Pagination ───────────────────────────────────────────── */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.totalItems)} of{" "}
                {pagination.totalItems} gaps
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => fetchGapData(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => fetchGapData(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          KEYWORD OPPORTUNITIES TAB
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === "opportunities" && (
        <>
          {/* ── Summary KPIs ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Opportunities</CardTitle>
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kwSummary?.totalOpportunities ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  Keyword gaps, expansions, and trends detected
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Impact</CardTitle>
                <Zap className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{kwSummary?.highImpact ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  Opportunities with high potential impact
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Visibility Gaps</CardTitle>
                <Target className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{kwSummary?.gaps ?? 0}</div>
                <p className="text-xs text-muted-foreground">
                  Tracked queries with no brand mentions
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Controls ─────────────────────────────────────────────── */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
                {/* Type Filter */}
                <Tabs
                  value={kwFilter}
                  onValueChange={(v) => setKwFilter(v as typeof kwFilter)}
                  className="shrink-0"
                >
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="gap">Gaps</TabsTrigger>
                    <TabsTrigger value="expansion">Expansions</TabsTrigger>
                    <TabsTrigger value="trending">Trending</TabsTrigger>
                    <TabsTrigger value="long-tail">Long-Tail</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Count label */}
                <span className="text-sm text-muted-foreground">
                  {filteredOpps.length} result{filteredOpps.length !== 1 ? "s" : ""}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ── Loading overlay ──────────────────────────────────────── */}
          {kwLoading && kwSummary && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating…
            </div>
          )}

          {/* ── Opportunity Cards ────────────────────────────────────── */}
          {!kwLoading && filteredOpps.length === 0 && (
            <Card>
              <CardContent className="py-0">
                <EmptyState
                  icon={Lightbulb}
                  title="No keyword opportunities found"
                  description="Track more queries to discover keyword gaps, semantic expansions, and trending opportunities from AI overviews."
                  action={
                    <Button variant="outline" size="sm" onClick={fetchKwData}>
                      Refresh
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {filteredOpps.map((opp, i) => (
              <OpportunityCard key={`${opp.keyword}-${i}`} opp={opp} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
