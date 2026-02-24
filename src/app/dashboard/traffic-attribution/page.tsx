"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  TrendingUp,
  MousePointer,
  Target,
  Info,
  CheckCircle,
  Unplug,
  BarChart3,
  Bot,
  Shield,
  Eye,
  Activity,
  FileSearch,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Download,
  Search,
  AlertTriangle,
  Gauge,
  Sparkles,
  Layers,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatGridSkeleton, ChartSkeleton } from "@/components/loading-skeletons";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface FeatureContribution {
  name: string;
  value: number;
  contribution: number;
}

interface AgentEvidence {
  evidenceId: string | null;
  requestCount: number;
  topAgentEngines: Array<{ engine: string; count: number }>;
  topAgentTypes: Array<{ purpose: string; count: number }>;
  matchConfidence: number;
  matchedPages: Array<{
    canonicalUrl: string;
    confidence: number;
    agentRequests: number;
  }>;
  sampleRequest?: {
    timestamp: string;
    engine: string;
    userAgent: string;
    responseTimeMs: number;
  };
  recencyHours: number;
  avgPageRelevance: number;
  engineDistribution: Record<string, number>;
}

interface QueryAttribution {
  queryId: string;
  queryText: string;
  searchVolume: number;
  visibilityRate: number;
  estimatedTraffic: number;
  estimatedConversions: number;
  totalResults: number;
  brandMentions: number;
  positiveRate: number;
  modelSource: "ga4" | "model" | "heuristic";
  confidence: number;
  confidenceTier: "high" | "medium" | "low";
  explainability: { featureContributions: FeatureContribution[] };
  agentEvidenceRef: string | null;
  agentEvidence: AgentEvidence | null;
  source?: string;
  matchConfidence?: number;
}

interface ModelMetrics {
  modelVersion: string;
  rmse: number;
  bias: number;
  r2: number;
  mae: number;
  sampleSize: number;
  driftDetected: boolean;
  date: string;
}

interface TrafficData {
  attribution: QueryAttribution[];
  dailyFunnel: Array<{
    date: string;
    visibility: number;
    estimatedClicks: number;
    estimatedConversions: number;
    realUsers?: number;
    realPageViews?: number;
    engagementRate?: number;
    agentRequests?: number;
    agentEngines?: Record<string, number>;
  }>;
  summary: {
    totalQueries: number;
    totalSearchVolume: number;
    totalEstimatedTraffic: number;
    totalEstimatedConversions: number;
    avgVisibility: number;
    avgConfidence: number;
    confidenceBreakdown: { high: number; medium: number; low: number };
    pctWithAgentEvidence: number;
    ga4Totals?: Record<string, number> | null;
    totalAgentRequests?: number;
    agentPagesTracked?: number;
    preAggDaysAvailable?: number;
  };
  model: {
    source: string;
    requestedMode: string;
    modelVersion: string;
    propertyId?: string;
    dateRange?: { startDate: string; endDate: string };
    note: string;
    agentAware?: boolean;
    agentWindowDays?: number;
    modelMetrics?: ModelMetrics | null;
  };
  ga4Connected: boolean;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

type AttributionMode = "auto" | "ga4" | "model" | "heuristic";

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

/* ---------- Confidence meter (inline) ---------- */

function ConfidenceMeter({ value, tier }: { value: number; tier: string }) {
  const pct = Math.round(value * 100);
  const color =
    tier === "high"
      ? "bg-green-500"
      : tier === "medium"
      ? "bg-yellow-500"
      : "bg-red-400";

  return (
    <div className="flex items-center gap-1.5" title={`${pct}% confidence (${tier})`}>
      <div className="w-14 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-medium text-muted-foreground">{pct}%</span>
    </div>
  );
}

/* ---------- Agent heatbar ---------- */

function AgentHeatbar({ evidence }: { evidence: AgentEvidence }) {
  if (!evidence || evidence.requestCount === 0) {
    return <span className="text-muted-foreground text-xs">No data</span>;
  }

  return (
    <div className="flex items-center gap-1" title={`${evidence.requestCount} total agent requests`}>
      <span className="text-xs font-medium">{evidence.requestCount} requests</span>
    </div>
  );
}

/* ---------- Source badge ---------- */

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { label: string; className: string }> = {
    ga4: { label: "GA4", className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300" },
    model: {
      label: "Model",
      className: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300",
    },
    heuristic: { label: "Est.", className: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400" },
  };
  const { label, className } = config[source] || config.heuristic;
  return (
    <Badge variant="outline" className={`text-xs ${className}`}>
      {label}
    </Badge>
  );
}

/* ---------- SHAP-style explain panel ---------- */

function ExplainPanel({ contributions }: { contributions: FeatureContribution[] }) {
  if (!contributions || contributions.length === 0) return null;

  const maxAbsContrib = Math.max(
    ...contributions.map((c) => Math.abs(c.contribution)),
    1
  );

  const featureLabel = (name: string) => {
    const labels: Record<string, string> = {
      visibility: "Visibility",
      searchVolume: "Search volume",
      agentRequests: "Agent requests",
      recency: "Recency",
      pageRelevance: "Page relevance",
      ga4_grounded: "GA4 match",
    };
    if (name.startsWith("engine_")) return name.replace("engine_", "");
    return labels[name] || name;
  };

  return (
    <div className="space-y-1.5">
      {contributions.slice(0, 8).map((c) => {
        const pct = Math.round((Math.abs(c.contribution) / maxAbsContrib) * 100);
        const isPositive = c.contribution >= 0;
        return (
          <div key={c.name} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-muted-foreground">{featureLabel(c.name)}</span>
            <div className="flex-1 flex items-center">
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden relative">
                <div
                  className={`h-full rounded-full ${isPositive ? "bg-blue-500" : "bg-red-400"}`}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
            </div>
            <span className="w-12 text-right font-mono">
              {isPositive ? "+" : ""}
              {c.contribution}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Evidence drawer (slideout) ---------- */

function EvidenceDrawer({
  query,
  workspaceId,
  onClose,
}: {
  query: QueryAttribution;
  workspaceId: string;
  onClose: () => void;
}) {
  const evidence = query.agentEvidence;
  const [fullEvidence, setFullEvidence] = useState<Record<string, unknown> | null>(null);
  const [recentRequests, setRecentRequests] = useState<Array<Record<string, unknown>>>([]);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  useEffect(() => {
    if (!query.agentEvidenceRef) return;
    setLoadingEvidence(true);
    fetch(`/api/workspaces/${workspaceId}/agent-evidence/${query.agentEvidenceRef}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setFullEvidence(data.evidence);
          setRecentRequests(data.recentRequests || []);
        }
      })
      .finally(() => setLoadingEvidence(false));
  }, [query.agentEvidenceRef, workspaceId]);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Overlay */}
      <div className="flex-1 bg-black/40" />
      {/* Drawer */}
      <div
        className="w-full max-w-xl bg-background shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-background z-10">
          <div className="min-w-0">
            <h3 className="font-semibold text-lg truncate">{query.queryText}</h3>
            <div className="flex items-center gap-2 mt-1">
              <SourceBadge source={query.modelSource} />
              <ConfidenceMeter value={query.confidence} tier={query.confidenceTier} />
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Visibility", value: `${query.visibilityRate}%` },
              { label: "Traffic", value: query.estimatedTraffic.toLocaleString(), color: "text-green-600" },
              { label: "Conversions", value: query.estimatedConversions.toLocaleString(), color: "text-purple-600" },
              { label: "Confidence", value: `${Math.round(query.confidence * 100)}%` },
            ].map((kpi) => (
              <div key={kpi.label} className="text-center p-3 bg-muted rounded-lg">
                <p className={`text-lg font-bold ${kpi.color || ""}`}>{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* Explainability — feature contributions */}
          {query.explainability?.featureContributions?.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                Feature contributions
              </h4>
              <ExplainPanel contributions={query.explainability.featureContributions} />
            </div>
          )}

          <Separator />

          {/* Agent evidence */}
          {evidence && evidence.requestCount > 0 ? (
            <>
              {/* Purpose breakdown */}
              {evidence.topAgentTypes.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Agent Purpose Breakdown</h4>
                  <div className="flex flex-wrap gap-2">
                    {evidence.topAgentTypes.map(({ purpose, count }) => (
                      <Badge key={purpose} variant="secondary" className="text-xs">
                        {purpose}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched pages */}
              {evidence.matchedPages.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Matched Pages</h4>
                  <div className="space-y-1.5">
                    {evidence.matchedPages.map((p) => (
                      <div key={p.canonicalUrl} className="flex items-center gap-2 text-xs">
                        <FileSearch className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate font-mono">{p.canonicalUrl}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {Math.round(p.confidence * 100)}%
                        </Badge>
                        <span className="text-muted-foreground">{p.agentRequests} reqs</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recency & relevance */}
              <div className="flex gap-4 text-xs">
                <div className="p-2 bg-muted rounded-lg flex-1 text-center">
                  <p className="font-bold">{evidence.recencyHours < 999 ? `${Math.round(evidence.recencyHours)}h` : "—"}</p>
                  <p className="text-muted-foreground">Recency</p>
                </div>
                <div className="p-2 bg-muted rounded-lg flex-1 text-center">
                  <p className="font-bold">{Math.round(evidence.avgPageRelevance * 100)}%</p>
                  <p className="text-muted-foreground">Page Relevance</p>
                </div>
                <div className="p-2 bg-muted rounded-lg flex-1 text-center">
                  <p className="font-bold">{evidence.requestCount}</p>
                  <p className="text-muted-foreground">Total Requests</p>
                </div>
              </div>

              {/* Sample request */}
              {evidence.sampleRequest && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Latest Agent Request</h4>
                  <div className="bg-muted p-3 rounded-lg text-xs font-mono space-y-1">
                    <div>
                      <span className="text-muted-foreground">Timestamp: </span>
                      {new Date(evidence.sampleRequest.timestamp).toLocaleString()}
                    </div>
                    <div>
                      <span className="text-muted-foreground">User-Agent: </span>
                      <span className="break-all">{evidence.sampleRequest.userAgent}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Response Time: </span>
                      {evidence.sampleRequest.responseTimeMs}ms
                    </div>
                  </div>
                </div>
              )}

              {/* Recent requests from deep evidence endpoint */}
              {loadingEvidence && (
                <div className="text-center py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                  Loading evidence details…
                </div>
              )}
              {recentRequests.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Recent Agent Requests (up to 25)</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {recentRequests.map((r, i) => (
                      <div key={String(r.id || i)} className="flex items-center gap-2 text-xs py-1 border-b border-muted last:border-0">
                        <div className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground" />
                        <span className="text-muted-foreground truncate flex-1">{r.agentPurpose as string}</span>
                        <span className="text-muted-foreground">
                          {new Date(r.timestamp as string).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {fullEvidence && !loadingEvidence && recentRequests.length === 0 && (
                <p className="text-xs text-muted-foreground text-center">No recent raw requests found.</p>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No agent evidence available for this query.</p>
              <p className="text-xs mt-1">
                Start ingesting agent requests to see access patterns.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Model monitoring card ---------- */

function ModelMonitoringCard({ metrics }: { metrics: ModelMetrics }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Gauge className="h-4 w-4" />
          Model Quality Monitor
          {metrics.driftDetected && (
            <Badge variant="destructive" className="text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Drift
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          {metrics.modelVersion} — {new Date(metrics.date).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-3 text-center">
          <div>
            <p className="text-lg font-bold">{metrics.rmse.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">RMSE</p>
          </div>
          <div>
            <p className={`text-lg font-bold ${Math.abs(metrics.bias) > 0.1 ? "text-yellow-600" : ""}`}>
              {metrics.bias > 0 ? "+" : ""}
              {metrics.bias.toFixed(3)}
            </p>
            <p className="text-[10px] text-muted-foreground">Bias</p>
          </div>
          <div>
            <p className="text-lg font-bold">{metrics.r2.toFixed(3)}</p>
            <p className="text-[10px] text-muted-foreground">R²</p>
          </div>
          <div>
            <p className="text-lg font-bold">{metrics.mae.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground">MAE</p>
          </div>
          <div>
            <p className="text-lg font-bold">{metrics.sampleSize.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">Samples</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  Main page component                                                */
/* ================================================================== */

export default function TrafficAttributionPage() {
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrafficData | null>(null);

  /* Mode & filters */
  const [mode, setMode] = useState<AttributionMode>("auto");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState("estimatedTraffic");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  /* UI toggles */
  const [showGA4Setup, setShowGA4Setup] = useState(false);
  const [showAgentRequests, setShowAgentRequests] = useState(true);
  const [showModelMonitor, setShowModelMonitor] = useState(false);

  /* GA4 form */
  const [ga4Form, setGA4Form] = useState({ propertyId: "", clientEmail: "", privateKey: "" });
  const [connecting, setConnecting] = useState(false);

  /* Evidence drawer */
  const [selectedQuery, setSelectedQuery] = useState<QueryAttribution | null>(null);

  /* ── Fetch ──────────────────────────────────────────────────── */

  const fetchData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        mode,
        page: String(page),
        limit: "50",
        sort: sortField,
        sortDir,
      });
      if (searchText) params.set("search", searchText);
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/traffic-attribution?${params}`
      );
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Failed to load traffic attribution data");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, mode, page, sortField, sortDir, searchText]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── GA4 handlers ───────────────────────────────────────────── */

  const handleConnectGA4 = async () => {
    if (!activeWorkspace || !ga4Form.propertyId) return;
    setConnecting(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/traffic-attribution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect-ga4",
          propertyId: ga4Form.propertyId,
          clientEmail: ga4Form.clientEmail || undefined,
          privateKey: ga4Form.privateKey || undefined,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(result.message);
        setShowGA4Setup(false);
        setGA4Form({ propertyId: "", clientEmail: "", privateKey: "" });
        fetchData();
      } else {
        toast.error(result.message || "Failed to connect GA4");
      }
    } catch {
      toast.error("Failed to connect GA4");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectGA4 = async () => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/traffic-attribution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect-ga4" }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success("GA4 disconnected");
        fetchData();
      }
    } catch {
      toast.error("Failed to disconnect GA4");
    }
  };

  const handleTestGA4 = async () => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/traffic-attribution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-ga4" }),
      });
      const result = await res.json();
      if (result.success) toast.success(`${result.message} (${result.latency}ms)`);
      else toast.error(result.message);
    } catch {
      toast.error("GA4 test failed");
    }
  };

  /* ── Export ─────────────────────────────────────────────────── */

  const handleExport = async (format: "json" | "csv") => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/traffic-attribution/export`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: mode === "auto" ? "all" : mode, format }),
        }
      );
      if (!res.ok) throw new Error();

      if (format === "csv") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `traffic-attribution-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("CSV exported");
      } else {
        const json = await res.json();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `traffic-attribution-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("JSON exported");
      }
    } catch {
      toast.error("Export failed");
    }
  };

  /* ── Sort handler ───────────────────────────────────────────── */

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  /* ── Loading state ──────────────────────────────────────────── */

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={6} />
        <ChartSkeleton height="h-[350px]" />
      </div>
    );
  }

  if (!data) return null;

  const isGA4 = data.ga4Connected && data.model.source === "ga4";
  const isModel = data.model.source === "model";
  const hasAgentData = (data.summary.totalAgentRequests || 0) > 0;

  const sourceLabel = isGA4
    ? "Google Analytics 4"
    : isModel
    ? "Agent-Grounded Model"
    : "Heuristic Estimates";

  const bannerColor = isGA4
    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
    : isModel
    ? "bg-cyan-50 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200"
    : "bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200";

  const modeLabels: Record<AttributionMode, string> = {
    auto: "Auto",
    ga4: "GA4",
    model: "Model",
    heuristic: "Heuristic",
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Agent Analytics & Traffic Attribution"
        description={`${sourceLabel}: ${data.model.note}`}
        helpText="Hybrid attribution combining GA4 real traffic, agent-grounded ML estimates, and heuristic fallback. Toggle modes, inspect per-query confidence, and explore feature contributions."
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={fetchData} disabled={loading} variant="outline" size="sm">
              {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("csv")}
              title="Export CSV"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />

      {/* ── Mode toggle + data source banner ────────────────────── */}
      <div className={`rounded-lg p-3 text-sm ${bannerColor}`}>
        <div className="flex items-start gap-2">
          {isGA4 ? (
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          ) : isModel ? (
            <Bot className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <p className="font-medium">{sourceLabel}</p>
              <div className="flex items-center gap-1 bg-background/50 rounded-md p-0.5">
                {(["auto", "ga4", "model", "heuristic"] as AttributionMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setPage(1); }}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      mode === m
                        ? "bg-background shadow text-foreground"
                        : "text-current opacity-60 hover:opacity-100"
                    }`}
                  >
                    {modeLabels[m]}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs opacity-90">{data.model.note}</p>
            {isGA4 && data.model.dateRange && (
              <p className="text-xs mt-1 opacity-75">
                GA4 Property: {data.model.propertyId} | Range: {data.model.dateRange.startDate} →{" "}
                {data.model.dateRange.endDate}
              </p>
            )}
            {hasAgentData && (
              <p className="text-xs mt-1 opacity-75">
                Agent data: {data.summary.totalAgentRequests?.toLocaleString()} requests across{" "}
                {data.summary.agentPagesTracked} pages | {data.summary.pctWithAgentEvidence}% of queries have agent evidence
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {data.ga4Connected ? (
              <>
                <Button size="sm" variant="outline" onClick={handleTestGA4}>
                  Test GA4
                </Button>
                <Button size="sm" variant="destructive" onClick={handleDisconnectGA4}>
                  <Unplug className="h-3 w-3 mr-1" />
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant={showGA4Setup ? "outline" : "default"}
                onClick={() => setShowGA4Setup(!showGA4Setup)}
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                Connect GA4
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* GA4 Setup Form */}
      {showGA4Setup && !data.ga4Connected && (
        <Card>
          <CardHeader>
            <CardTitle>Connect Google Analytics 4</CardTitle>
            <CardDescription>
              Enter your GA4 Property ID and service account credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Property ID *</label>
              <Input
                placeholder="e.g. 123456789"
                value={ga4Form.propertyId}
                onChange={(e) => setGA4Form((prev) => ({ ...prev, propertyId: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Numeric GA4 property ID (not the measurement ID starting with G-)
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Service Account Email</label>
              <Input
                placeholder="your-sa@your-project.iam.gserviceaccount.com"
                value={ga4Form.clientEmail}
                onChange={(e) => setGA4Form((prev) => ({ ...prev, clientEmail: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Service Account Private Key</label>
              <textarea
                className="w-full rounded-md border p-2 text-xs font-mono min-h-[80px] bg-background"
                placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
                value={ga4Form.privateKey}
                onChange={(e) => setGA4Form((prev) => ({ ...prev, privateKey: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConnectGA4} disabled={!ga4Form.propertyId || connecting}>
                {connecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Connect & Test
              </Button>
              <Button variant="outline" onClick={() => setShowGA4Setup(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── KPI cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-600 shrink-0" />
              <div>
                <p className="text-xl font-bold">{data.summary.avgVisibility}%</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Avg Visibility</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2">
              <MousePointer className="h-4 w-4 text-green-600 shrink-0" />
              <div>
                <p className="text-xl font-bold">{data.summary.totalEstimatedTraffic.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {isGA4 ? "GA4 Sessions" : "Est. Clicks"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-600 shrink-0" />
              <div>
                <p className="text-xl font-bold">{data.summary.totalEstimatedConversions.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {isGA4 ? "GA4 Conv." : "Est. Conv."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-cyan-600 shrink-0" />
              <div>
                <p className="text-xl font-bold">{(data.summary.totalAgentRequests || 0).toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Agent Reqs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xl font-bold">{data.summary.totalSearchVolume.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Search Volume</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xl font-bold">{data.summary.totalQueries}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Queries</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xl font-bold">{Math.round(data.summary.avgConfidence * 100)}%</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Avg Confidence</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 text-center">
            <p className="text-xl font-bold">{data.summary.pctWithAgentEvidence}%</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Agent Coverage</p>
          </CardContent>
        </Card>
      </div>

      {/* Confidence breakdown pills */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">Confidence:</span>
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs dark:bg-green-950 dark:text-green-300">
          High: {data.summary.confidenceBreakdown.high}
        </Badge>
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs dark:bg-yellow-950 dark:text-yellow-300">
          Medium: {data.summary.confidenceBreakdown.medium}
        </Badge>
        <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs dark:bg-red-950 dark:text-red-300">
          Low: {data.summary.confidenceBreakdown.low}
        </Badge>
        {data.model.modelMetrics && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs ml-auto"
            onClick={() => setShowModelMonitor(!showModelMonitor)}
          >
            <Gauge className="h-3 w-3 mr-1" />
            {showModelMonitor ? "Hide" : "Show"} Model Monitor
          </Button>
        )}
      </div>

      {/* Model monitoring panel */}
      {showModelMonitor && data.model.modelMetrics && (
        <ModelMonitoringCard metrics={data.model.modelMetrics} />
      )}

      {/* GA4 totals row */}
      {isGA4 && data.summary.ga4Totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "GA4 Total Sessions", value: data.summary.ga4Totals.sessions, color: "text-green-600" },
            { label: "GA4 Total Users", value: data.summary.ga4Totals.totalUsers, color: "text-blue-600" },
            { label: "GA4 Page Views", value: data.summary.ga4Totals.screenPageViews, color: "text-orange-600" },
            { label: "GA4 Conversions", value: data.summary.ga4Totals.conversions, color: "text-purple-600" },
          ].map((metric) => (
            <Card key={metric.label}>
              <CardContent className="pt-6 text-center">
                <p className={`text-xl font-bold ${metric.color}`}>{(metric.value || 0).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Daily funnel chart ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Visibility → {isGA4 ? "Sessions" : "Clicks"} → Agent Requests Funnel
              </CardTitle>
              <CardDescription>
                {isGA4
                  ? "Real GA4 daily metrics overlaid with AI visibility and agent access"
                  : "Estimated daily traffic from AI visibility with agent request overlay"}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant={showAgentRequests ? "default" : "outline"}
              onClick={() => setShowAgentRequests(!showAgentRequests)}
              className="text-xs"
            >
              <Bot className="h-3 w-3 mr-1" />
              Agent Layer
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={data.dailyFunnel}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) =>
                  new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })
                }
                fontSize={12}
              />
              <YAxis yAxisId="left" unit="%" />
              <YAxis yAxisId="right" orientation="right" />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Tooltip
                content={(props: any) => {
                  const { active, payload, label } = props;
                  if (!active || !payload) return null;
                  return (
                    <div className="bg-background border rounded-lg shadow-lg p-3 text-xs">
                      <p className="font-medium mb-1">
                        {new Date(label || "").toLocaleDateString("en", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      {(payload as Array<{ color?: string; name?: string; value?: number | string; payload?: Record<string, unknown> }>).map((entry: { color?: string; name?: string; value?: number | string; payload?: Record<string, unknown> }, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-muted-foreground">{entry.name}:</span>
                          <span className="font-medium">{String(entry.value ?? "")}</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="visibility"
                stroke="#3b82f6"
                name="Visibility %"
                strokeWidth={2}
              />
              <Bar
                yAxisId="right"
                dataKey="estimatedClicks"
                fill="#22c55e"
                name={isGA4 ? "GA4 Sessions" : "Est. Clicks"}
                opacity={0.6}
              />
              <Bar
                yAxisId="right"
                dataKey="estimatedConversions"
                fill="#a855f7"
                name={isGA4 ? "GA4 Conversions" : "Est. Conversions"}
                opacity={0.6}
              />
              {showAgentRequests && (
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="agentRequests"
                  fill="#06b6d4"
                  stroke="#06b6d4"
                  name="Agent Requests"
                  opacity={0.2}
                  strokeWidth={2}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Search bar ────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search queries…"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* ── Per-query attribution table ───────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5" />
              Per-Query Attribution
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              {data.pagination.total} queries | Page {data.pagination.page}/{data.pagination.totalPages}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {[
                    { key: "queryText", label: "Query", align: "text-left" },
                    { key: "searchVolume", label: "Volume", align: "text-center" },
                    { key: "visibilityRate", label: "Visibility", align: "text-center" },
                    { key: "estimatedTraffic", label: isGA4 ? "Sessions" : "Est. Traffic", align: "text-center" },
                    { key: "estimatedConversions", label: isGA4 ? "Conv." : "Est. Conv.", align: "text-center" },
                    { key: "confidence", label: "Confidence", align: "text-center" },
                    { key: "", label: "Agent Evidence", align: "text-center" },
                    { key: "positiveRate", label: "Sentiment", align: "text-center" },
                    { key: "modelSource", label: "Source", align: "text-center" },
                  ].map((col) => (
                    <th
                      key={col.label}
                      className={`${col.align} py-2 font-medium ${col.key ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                      onClick={() => col.key && toggleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {col.key && sortField === col.key && (
                          <ArrowUpDown className="h-3 w-3" />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.attribution.map((q) => (
                  <tr
                    key={q.queryId}
                    className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedQuery(q)}
                  >
                    <td className="py-3 font-medium max-w-[200px] truncate">{q.queryText}</td>
                    <td className="text-center py-3 text-muted-foreground">
                      {q.searchVolume.toLocaleString()}
                    </td>
                    <td className="text-center py-3">
                      <Badge
                        variant={
                          q.visibilityRate >= 50
                            ? "default"
                            : q.visibilityRate > 0
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {q.visibilityRate}%
                      </Badge>
                    </td>
                    <td className="text-center py-3 font-medium text-green-600">
                      {q.estimatedTraffic.toLocaleString()}
                    </td>
                    <td className="text-center py-3 font-medium text-purple-600">
                      {q.estimatedConversions.toLocaleString()}
                    </td>
                    <td className="text-center py-3">
                      <ConfidenceMeter value={q.confidence} tier={q.confidenceTier} />
                    </td>
                    <td className="text-center py-3">
                      {q.agentEvidence ? (
                        <AgentHeatbar evidence={q.agentEvidence} />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="text-center py-3">
                      <Badge variant="outline" className="text-xs">
                        {q.positiveRate}% pos
                      </Badge>
                    </td>
                    <td className="text-center py-3">
                      <SourceBadge source={q.modelSource} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.attribution.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>No attribution data yet.</p>
              <p className="text-xs mt-1">Track queries to see traffic attribution.</p>
            </div>
          )}

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <p className="text-xs text-muted-foreground">
                Showing {(data.pagination.page - 1) * data.pagination.limit + 1}-
                {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{" "}
                {data.pagination.total}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {Array.from({ length: Math.min(5, data.pagination.totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, data.pagination.totalPages - 4));
                  const pageNum = start + i;
                  if (pageNum > data.pagination.totalPages) return null;
                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={pageNum === page ? "default" : "outline"}
                      onClick={() => setPage(pageNum)}
                      className="w-8"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Evidence drawer ───────────────────────────────────────── */}
      {selectedQuery && activeWorkspace && (
        <EvidenceDrawer
          query={selectedQuery}
          workspaceId={activeWorkspace.id}
          onClose={() => setSelectedQuery(null)}
        />
      )}
    </div>
  );
}
