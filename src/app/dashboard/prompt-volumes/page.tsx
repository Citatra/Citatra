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
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  Bell,
  RefreshCw,
  Loader2,
  BarChart3,
  Activity,
  Eye,
  Zap,
  ChevronRight,
  Sparkles,
  Globe,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Plus,
  Trash2,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  StatGridSkeleton,
  ChartSkeleton,
  TableSkeleton,
} from "@/components/loading-skeletons";
import { EmptyState } from "@/components/empty-state";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EngineBreakdown {
  engine: string;
  volume: number;
  share: number;
}

interface RegionBreakdown {
  region: string;
  volume: number;
  share: number;
}

interface TrendPoint {
  date: string;
  volume: number;
  delta: number;
}

interface PromptVolumeTopic {
  id: string;
  canonicalTopic: string;
  exemplarPrompts: string[];
  estimatedVolume: number;
  volumeCILow: number;
  volumeCIHigh: number;
  confidence: "high" | "medium" | "low";
  engineBreakdown: EngineBreakdown[];
  regionBreakdown: RegionBreakdown[];
  intent: string;
  sentiment: string;
  provenance: string;
  observedFraction: number;
  syntheticFraction: number;
  tags: string[];
  weekOverWeekChange: number;
  isTrending: boolean;
  trendDirection: "rising" | "falling" | "stable";
  trendData: TrendPoint[];
  periodStart: string;
  periodEnd: string;
  granularity: string;
  createdAt: string;
}

interface Stats {
  totalTopics: number;
  totalVolume: number;
  avgVolume: number;
  trendingCount: number;
  risingCount: number;
  avgWeekOverWeek: number;
}

interface Alert {
  id: string;
  name: string;
  triggerType: string;
  queryPattern?: string;
  engines: string[];
  regions: string[];
  thresholdValue?: number;
  changePercent?: number;
  channels: string[];
  isActive: boolean;
  lastTriggeredAt?: string;
  triggerCount: number;
  createdAt: string;
}

interface TrendsData {
  trendingTopics: PromptVolumeTopic[];
  overallTrend: { period: string; totalVolume: number; avgDelta: number; topicCount: number }[];
  engineDistribution: { engine: string; totalVolume: number; avgShare: number }[];
  regionDistribution: { region: string; totalVolume: number; avgShare: number }[];
  intentDistribution: { intent: string; count: number; totalVolume: number }[];
  sentimentDistribution: { sentiment: string; count: number; totalVolume: number }[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "hsl(142, 76%, 36%)",
  negative: "hsl(0, 84%, 60%)",
  neutral: "hsl(217, 19%, 55%)",
  mixed: "hsl(43, 96%, 56%)",
};

const INTENT_COLORS: Record<string, string> = {
  informational: "hsl(217, 91%, 60%)",
  transactional: "hsl(142, 76%, 36%)",
  navigational: "hsl(25, 95%, 53%)",
  "follow-up": "hsl(280, 67%, 54%)",
};

const REGIONS = [
  { value: "", label: "All Regions" },
  { value: "US", label: "United States" },
  { value: "UK", label: "United Kingdom" },
  { value: "CA", label: "Canada" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "BR", label: "Brazil" },
  { value: "AU", label: "Australia" },
  { value: "KR", label: "South Korea" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatVolume(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function TrendIcon({ direction }: { direction: string }) {
  switch (direction) {
    case "rising":
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    case "falling":
      return <TrendingDown className="h-4 w-4 text-red-500" />;
    default:
      return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
}

function ConfidenceBadge({ level }: { level: string }) {
  const variant =
    level === "high"
      ? "default"
      : level === "medium"
      ? "secondary"
      : "outline";
  return <Badge variant={variant}>{level}</Badge>;
}

function ProvenanceBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    observed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    synthetic: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    "model-inferred": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[type] || ""}`}>
      {type}
    </span>
  );
}

// Mini sparkline for table rows
function MiniSparkline({ data }: { data: TrendPoint[] }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="w-24 h-8">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <Area
            type="monotone"
            dataKey="volume"
            stroke="hsl(217, 91%, 60%)"
            fill="hsl(217, 91%, 60%)"
            fillOpacity={0.1}
            strokeWidth={1.5}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PromptVolumesPage() {
  const { activeWorkspace } = useWorkspace();

  // Data state
  const [topics, setTopics] = useState<PromptVolumeTopic[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<PromptVolumeTopic | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [intentFilter, setIntentFilter] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("");
  const [provenanceFilter, setProvenanceFilter] = useState("");
  const [trendingOnly, setTrendingOnly] = useState(false);
  const [activeTab, setActiveTab] = useState("explore");
  const [seeding, setSeeding] = useState(false);
  const [importing, setImporting] = useState(false);

  // Alert dialog state
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [newAlertName, setNewAlertName] = useState("");
  const [newAlertTrigger, setNewAlertTrigger] = useState("trending");
  const [newAlertPattern, setNewAlertPattern] = useState("");
  const [newAlertThreshold, setNewAlertThreshold] = useState("");
  const [newAlertChange, setNewAlertChange] = useState("");
  const [creatingAlert, setCreatingAlert] = useState(false);

  // ─── Data Fetching ──────────────────────────────────────────────────────

  const fetchTopics = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (regionFilter) params.set("region", regionFilter);
      if (intentFilter) params.set("intent", intentFilter);
      if (sentimentFilter) params.set("sentiment", sentimentFilter);
      if (provenanceFilter) params.set("provenance", provenanceFilter);
      if (trendingOnly) params.set("trending", "true");

      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/prompt-volumes/topics?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTopics(data.topics || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load prompt volume data");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, searchQuery, regionFilter, intentFilter, sentimentFilter, provenanceFilter, trendingOnly]);

  const fetchTrends = useCallback(async () => {
    if (!activeWorkspace) return;
    setTrendsLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/prompt-volumes/trends`
      );
      if (!res.ok) throw new Error("Failed to fetch trends");
      const data = await res.json();
      setTrendsData(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load trends data");
    } finally {
      setTrendsLoading(false);
    }
  }, [activeWorkspace]);

  const fetchAlerts = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/prompt-volumes/alerts`
      );
      if (!res.ok) throw new Error("Failed to fetch alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error(err);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  useEffect(() => {
    fetchTrends();
    fetchAlerts();
  }, [fetchTrends, fetchAlerts]);

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleSeedData = async () => {
    if (!activeWorkspace) return;
    setSeeding(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/prompt-volumes/seed`,
        { method: "POST" }
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchTopics();
        fetchTrends();
      } else {
        toast.info(data.message || data.error);
      }
    } catch {
      toast.error("Failed to seed data");
    } finally {
      setSeeding(false);
    }
  };

  const handleExport = async (format: "csv" | "json") => {
    if (!activeWorkspace) return;
    try {
      const params = new URLSearchParams({ format });
      if (searchQuery) params.set("q", searchQuery);
      if (regionFilter) params.set("region", regionFilter);

      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/prompt-volumes/export?${params.toString()}`
      );
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prompt-volumes.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch {
      toast.error("Export failed");
    }
  };

  const handleCreateAlert = async () => {
    if (!activeWorkspace || !newAlertName) return;
    setCreatingAlert(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/prompt-volumes/alerts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newAlertName,
            triggerType: newAlertTrigger,
            queryPattern: newAlertPattern || undefined,
            thresholdValue: newAlertThreshold ? parseInt(newAlertThreshold) : undefined,
            changePercent: newAlertChange ? parseInt(newAlertChange) : undefined,
            channels: ["email"],
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to create alert");
      toast.success("Alert created");
      setAlertDialogOpen(false);
      setNewAlertName("");
      setNewAlertPattern("");
      setNewAlertThreshold("");
      setNewAlertChange("");
      fetchAlerts();
    } catch {
      toast.error("Failed to create alert");
    } finally {
      setCreatingAlert(false);
    }
  };

  const handleToggleAlert = async (alertId: string, isActive: boolean) => {
    if (!activeWorkspace) return;
    try {
      await fetch(
        `/api/workspaces/${activeWorkspace.id}/prompt-volumes/alerts`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: alertId, isActive }),
        }
      );
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, isActive } : a))
      );
    } catch {
      toast.error("Failed to update alert");
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!activeWorkspace) return;
    try {
      await fetch(
        `/api/workspaces/${activeWorkspace.id}/prompt-volumes/alerts?id=${alertId}`,
        { method: "DELETE" }
      );
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      toast.success("Alert deleted");
    } catch {
      toast.error("Failed to delete alert");
    }
  };

  // ─── Guards ─────────────────────────────────────────────────────────────

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Globe}
          title="No workspace selected"
          description="Select or create a workspace to view Prompt Volumes."
        />
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Prompt Volumes"
        description="Discover what people ask AI — volume, intent, sentiment, and trend signals."
        helpText="Prompt Volumes reveals real consumer prompts with estimated volumes and trend signals for AEO strategy."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeedData}
              disabled={seeding}
            >
              {seeding ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Database className="h-4 w-4 mr-1" />
              )}
              Seed Demo Data
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!activeWorkspace) return;
                try {
                  setImporting(true);
                  const res = await fetch(
                    `/api/workspaces/${activeWorkspace.id}/prompt-volumes/import-from-queries`,
                    { method: "POST" }
                  );
                  const data = await res.json();
                  if (res.ok) {
                    toast.success(data.message || "Imported from queries");
                    fetchTopics();
                    fetchTrends();
                  } else {
                    toast.error(data.error || data.message || "Import failed");
                  }
                } catch (err) {
                  console.error(err);
                  toast.error("Import failed");
                } finally {
                  setImporting(false);
                }
              }}
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Database className="h-4 w-4 mr-1" />
              )}
              Import from Queries
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("csv")}
            >
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("json")}
            >
              <Download className="h-4 w-4 mr-1" />
              JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchTopics();
                fetchTrends();
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* ── Stat Cards ──────────────────────────────────────────────────── */}
      {loading && !stats ? (
        <StatGridSkeleton count={5} />
      ) : stats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Topics</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatVolume(stats.totalTopics)}</div>
              <p className="text-xs text-muted-foreground">Canonical prompt topics tracked</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatVolume(stats.totalVolume)}</div>
              <p className="text-xs text-muted-foreground">Estimated weekly prompts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Volume</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatVolume(Math.round(stats.avgVolume))}</div>
              <p className="text-xs text-muted-foreground">Per topic average</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Trending</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.trendingCount}</div>
              <p className="text-xs text-muted-foreground">Topics with spike detected</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg WoW Change</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stats.avgWeekOverWeek >= 0 ? "text-green-600" : "text-red-600"}`}>
                {stats.avgWeekOverWeek >= 0 ? "+" : ""}
                {stats.avgWeekOverWeek.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">Week-over-week trend</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* ── Main Tabs ───────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="explore">
            <Search className="h-4 w-4 mr-1" />
            Explore
          </TabsTrigger>
          <TabsTrigger value="trends">
            <TrendingUp className="h-4 w-4 mr-1" />
            Trends & Analytics
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <Bell className="h-4 w-4 mr-1" />
            Alerts
          </TabsTrigger>
        </TabsList>

        {/* ── EXPLORE TAB ─────────────────────────────────────────────── */}
        <TabsContent value="explore" className="space-y-4">
          {/* Search & Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search prompts, topics, tags..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && fetchTopics()}
                    />
                  </div>
                  <Button onClick={fetchTopics}>
                    <Search className="h-4 w-4 mr-1" />
                    Search
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Select value={regionFilter} onValueChange={setRegionFilter}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Region" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r.value || "all"} value={r.value || "all"}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={intentFilter} onValueChange={setIntentFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Intent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Intents</SelectItem>
                      <SelectItem value="informational">Informational</SelectItem>
                      <SelectItem value="transactional">Transactional</SelectItem>
                      <SelectItem value="navigational">Navigational</SelectItem>
                      <SelectItem value="follow-up">Follow-up</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Sentiment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sentiment</SelectItem>
                      <SelectItem value="positive">Positive</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={provenanceFilter} onValueChange={setProvenanceFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Provenance" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="observed">Observed</SelectItem>
                      <SelectItem value="synthetic">Synthetic</SelectItem>
                      <SelectItem value="model-inferred">Model Inferred</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2 ml-auto">
                    <Switch
                      checked={trendingOnly}
                      onCheckedChange={setTrendingOnly}
                      id="trending-toggle"
                    />
                    <Label htmlFor="trending-toggle" className="text-sm cursor-pointer">
                      Trending only
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results Table */}
          {loading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : topics.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={Sparkles}
                  title="No prompt volume data yet"
                  description="Seed demo data to explore prompt volumes, or wait for data to populate."
                  action={
                    <Button onClick={handleSeedData} disabled={seeding}>
                      {seeding ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Database className="h-4 w-4 mr-1" />
                      )}
                      Seed Demo Data
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Topic Explorer</CardTitle>
                <CardDescription>
                  {topics.length} topics found — click a row to see details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Topic</TableHead>
                      <TableHead className="text-right">Est. Volume</TableHead>
                      <TableHead className="text-center">Confidence</TableHead>
                      <TableHead className="text-center">Trend</TableHead>
                      <TableHead className="text-right">WoW %</TableHead>
                      <TableHead className="text-center">Intent</TableHead>
                      <TableHead className="text-center">Sentiment</TableHead>
                      <TableHead className="text-center">Source</TableHead>
                      <TableHead>Sparkline</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topics.map((topic) => (
                      <TableRow
                        key={topic.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedTopic(topic)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{topic.canonicalTopic}</span>
                            {topic.isTrending && (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                                <Zap className="h-3 w-3 mr-0.5" />
                                HOT
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground line-clamp-1">
                            {topic.exemplarPrompts?.[0]}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                {formatVolume(topic.estimatedVolume)}
                              </TooltipTrigger>
                              <TooltipContent>
                                CI: {formatVolume(topic.volumeCILow)} – {formatVolume(topic.volumeCIHigh)}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-center">
                          <ConfidenceBadge level={topic.confidence} />
                        </TableCell>
                        <TableCell className="text-center">
                          <TrendIcon direction={topic.trendDirection} />
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={`inline-flex items-center gap-1 text-sm font-medium ${
                              topic.weekOverWeekChange > 0
                                ? "text-green-600"
                                : topic.weekOverWeekChange < 0
                                ? "text-red-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {topic.weekOverWeekChange > 0 ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : topic.weekOverWeekChange < 0 ? (
                              <ArrowDownRight className="h-3 w-3" />
                            ) : null}
                            {topic.weekOverWeekChange > 0 ? "+" : ""}
                            {topic.weekOverWeekChange.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="capitalize text-xs">
                            {topic.intent}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="capitalize text-xs">
                            {topic.sentiment}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <ProvenanceBadge type={topic.provenance} />
                        </TableCell>
                        <TableCell>
                          <MiniSparkline data={topic.trendData} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Topic Detail Drawer */}
          {selectedTopic && (
            <TopicDetailPanel
              topic={selectedTopic}
              onClose={() => setSelectedTopic(null)}
            />
          )}
        </TabsContent>

        {/* ── TRENDS & ANALYTICS TAB ──────────────────────────────────── */}
        <TabsContent value="trends" className="space-y-4">
          {trendsLoading ? (
            <>
              <ChartSkeleton />
              <div className="grid gap-4 md:grid-cols-2">
                <ChartSkeleton height="h-[250px]" />
                <ChartSkeleton height="h-[250px]" />
              </div>
            </>
          ) : !trendsData ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={TrendingUp}
                  title="No trends data"
                  description="Seed demo data to see trend analytics."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Overall Volume Trend */}
              {trendsData.overallTrend.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Overall Prompt Volume Trend</CardTitle>
                    <CardDescription>
                      Aggregate prompt volume across all tracked topics
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={trendsData.overallTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="period" className="text-xs" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={formatVolume} className="text-xs" tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          formatter={(value) => [formatVolume(Number(value)), "Volume"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="totalVolume"
                          stroke="hsl(217, 91%, 60%)"
                          fill="hsl(217, 91%, 60%)"
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {/* Intent Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>Intent Distribution</CardTitle>
                    <CardDescription>Volume by prompt intent type</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={trendsData.intentDistribution}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="intent" className="text-xs capitalize" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={formatVolume} className="text-xs" tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          formatter={(value) => [formatVolume(Number(value)), "Volume"]}
                        />
                        <Bar dataKey="totalVolume" radius={[4, 4, 0, 0]}>
                          {trendsData.intentDistribution.map((entry) => (
                            <Cell
                              key={entry.intent}
                              fill={INTENT_COLORS[entry.intent] || "hsl(217, 91%, 60%)"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Sentiment Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>Sentiment Distribution</CardTitle>
                    <CardDescription>How users frame their prompts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={trendsData.sentimentDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          dataKey="totalVolume"
                          nameKey="sentiment"
                          label={({ name }) => name}
                        >
                          {trendsData.sentimentDistribution.map((entry) => (
                            <Cell
                              key={entry.sentiment}
                              fill={SENTIMENT_COLORS[entry.sentiment] || "hsl(0,0%,60%)"}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value) => [formatVolume(Number(value)), "Volume"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Region Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top Regions</CardTitle>
                    <CardDescription>Volume by geographic region</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart
                        data={trendsData.regionDistribution.slice(0, 10)}
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tickFormatter={formatVolume} tick={{ fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="region"
                          width={40}
                          tick={{ fontSize: 11 }}
                        />
                        <RechartsTooltip
                          formatter={(value) => [formatVolume(Number(value)), "Volume"]}
                        />
                        <Bar
                          dataKey="totalVolume"
                          fill="hsl(217, 91%, 60%)"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Top Trending Topics */}
              {trendsData.trendingTopics.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Top Trending Topics</CardTitle>
                    <CardDescription>
                      Topics with the highest week-over-week growth
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {trendsData.trendingTopics.slice(0, 10).map((topic, i) => (
                        <div
                          key={topic.id}
                          className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                          onClick={() => setSelectedTopic(topic)}
                        >
                          <span className="text-lg font-bold text-muted-foreground w-6">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {topic.canonicalTopic}
                              </span>
                              {topic.isTrending && (
                                <Badge variant="default" className="text-[10px] px-1.5 py-0 shrink-0">
                                  <Zap className="h-3 w-3 mr-0.5" />
                                  HOT
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-semibold">
                              {formatVolume(topic.estimatedVolume)}
                            </div>
                            <span
                              className={`text-sm ${
                                topic.weekOverWeekChange > 0
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {topic.weekOverWeekChange > 0 ? "+" : ""}
                              {topic.weekOverWeekChange.toFixed(1)}%
                            </span>
                          </div>
                          <MiniSparkline data={topic.trendData} />
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ── ALERTS TAB ──────────────────────────────────────────────── */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Volume Alerts</CardTitle>
                <CardDescription>
                  Get notified when prompt volumes change significantly
                </CardDescription>
              </div>
              <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Alert
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Alert</DialogTitle>
                    <DialogDescription>
                      Set up notifications for prompt volume changes
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Alert Name</Label>
                      <Input
                        placeholder="e.g., Rising AI tools prompts"
                        value={newAlertName}
                        onChange={(e) => setNewAlertName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Trigger Type</Label>
                      <Select value={newAlertTrigger} onValueChange={setNewAlertTrigger}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trending">Trending Spike</SelectItem>
                          <SelectItem value="threshold">Volume Threshold</SelectItem>
                          <SelectItem value="change">% Change</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Query/Topic Pattern (optional)</Label>
                      <Input
                        placeholder="e.g., AI tools"
                        value={newAlertPattern}
                        onChange={(e) => setNewAlertPattern(e.target.value)}
                      />
                    </div>
                    {newAlertTrigger === "threshold" && (
                      <div className="space-y-2">
                        <Label>Volume Threshold</Label>
                        <Input
                          type="number"
                          placeholder="e.g., 50000"
                          value={newAlertThreshold}
                          onChange={(e) => setNewAlertThreshold(e.target.value)}
                        />
                      </div>
                    )}
                    {newAlertTrigger === "change" && (
                      <div className="space-y-2">
                        <Label>Change % Threshold</Label>
                        <Input
                          type="number"
                          placeholder="e.g., 25"
                          value={newAlertChange}
                          onChange={(e) => setNewAlertChange(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setAlertDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateAlert}
                      disabled={!newAlertName || creatingAlert}
                    >
                      {creatingAlert && (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      )}
                      Create Alert
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <EmptyState
                  icon={Bell}
                  title="No alerts configured"
                  description="Create alerts to get notified about prompt volume changes."
                  action={
                    <Button
                      size="sm"
                      onClick={() => setAlertDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Alert
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Pattern</TableHead>
                      <TableHead>Channels</TableHead>
                      <TableHead className="text-center">Triggered</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((alert) => (
                      <TableRow key={alert.id}>
                        <TableCell className="font-medium">{alert.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {alert.triggerType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {alert.queryPattern || "All topics"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {alert.channels.map((c) => (
                              <Badge key={c} variant="secondary" className="text-xs">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {alert.triggerCount}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={alert.isActive}
                            onCheckedChange={(checked) =>
                              handleToggleAlert(alert.id, checked)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAlert(alert.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Topic Detail Panel ──────────────────────────────────────────────────────

function TopicDetailPanel({
  topic,
  onClose,
}: {
  topic: PromptVolumeTopic;
  onClose: () => void;
}) {
  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl">{topic.canonicalTopic}</CardTitle>
            {topic.isTrending && (
              <Badge>
                <Zap className="h-3 w-3 mr-1" />
                Trending
              </Badge>
            )}
          </div>
          <CardDescription>
            Detailed view · Period: {new Date(topic.periodStart).toLocaleDateString()} –{" "}
            {new Date(topic.periodEnd).toLocaleDateString()}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ✕
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Volume & Confidence */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Estimated Volume</p>
            <p className="text-3xl font-bold">{formatVolume(topic.estimatedVolume)}</p>
            <p className="text-xs text-muted-foreground">
              CI: {formatVolume(topic.volumeCILow)} – {formatVolume(topic.volumeCIHigh)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Week-over-week</p>
            <p
              className={`text-3xl font-bold ${
                topic.weekOverWeekChange > 0
                  ? "text-green-600"
                  : topic.weekOverWeekChange < 0
                  ? "text-red-600"
                  : ""
              }`}
            >
              {topic.weekOverWeekChange > 0 ? "+" : ""}
              {topic.weekOverWeekChange.toFixed(1)}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Confidence</p>
            <ConfidenceBadge level={topic.confidence} />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Provenance</p>
            <ProvenanceBadge type={topic.provenance} />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(topic.observedFraction * 100)}% observed · {Math.round(topic.syntheticFraction * 100)}% synthetic
            </p>
          </div>
        </div>

        {/* Trend Chart */}
        {topic.trendData && topic.trendData.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Volume Trend (12 weeks)</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={topic.trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tickFormatter={formatVolume} tick={{ fontSize: 10 }} />
                <RechartsTooltip
                  labelFormatter={(d) => new Date(d).toLocaleDateString()}
                  formatter={(value) => [formatVolume(Number(value)), "Volume"]}
                />
                <Line
                  type="monotone"
                  dataKey="volume"
                  stroke="hsl(217, 91%, 60%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top Regions */}
        {topic.regionBreakdown && topic.regionBreakdown.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Top Regions</h4>
            <div className="flex flex-wrap gap-2">
              {topic.regionBreakdown.slice(0, 6).map((rb) => (
                <div key={rb.region} className="px-3 py-2 rounded-lg border text-center">
                  <p className="text-sm font-semibold">{rb.region}</p>
                  <p className="text-xs text-muted-foreground">{formatVolume(rb.volume)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exemplar Prompts */}
        {topic.exemplarPrompts && topic.exemplarPrompts.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Sample Prompts</h4>
            <div className="space-y-2">
              {topic.exemplarPrompts.map((prompt, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded bg-muted/50 text-sm"
                >
                  <span className="text-muted-foreground shrink-0 font-mono text-xs mt-0.5">
                    {i + 1}.
                  </span>
                  <span>&ldquo;{prompt}&rdquo;</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meta Info */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="capitalize">
            Intent: {topic.intent}
          </Badge>
          <Badge variant="outline" className="capitalize">
            Sentiment: {topic.sentiment}
          </Badge>
          <Badge variant="outline">
            Granularity: {topic.granularity}
          </Badge>
          {topic.tags?.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
