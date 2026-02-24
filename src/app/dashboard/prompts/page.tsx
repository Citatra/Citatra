"use client";

import { useWorkspace } from "@/components/workspace-provider";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Sparkles,
  Upload,
  MoreHorizontal,
  Check,
  X,
  Play,
  Pause,
  Trash2,
  Tag,
  FolderOpen,
  Globe,
  BarChart3,
  Search,
  Loader2,
  Lightbulb,
  FileText,
  Zap,
  Eye,
  TrendingUp,
  Users,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Hash,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/loading-skeletons";

// ---- Types ----

interface PromptCompetitor {
  domain: string;
  name: string;
}

interface Prompt {
  id: string;
  queryText: string;
  status: "active" | "inactive" | "suggested" | "paused" | "archived";
  engines: string[];
  topic: string;
  tags: string[];
  location: string;
  promptVolume: number | null;
  suggestedAt: string | null;
  lastFetchedAt: string | null;
  createdAt: string;
  // Aggregated metrics
  visibility: number | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  avgPosition: number | null;
  competitors: PromptCompetitor[];
}

interface OverviewSource {
  position: number;
  url: string;
  title: string;
  snippet: string;
  isBrandMentioned: boolean;
  mentionType: string;
  sentiment: string;
  competitorDomain: string;
}

interface OverviewEngine {
  engine: string;
  overviewText: string;
  sources: OverviewSource[];
}

interface OverviewData {
  queryText: string;
  overviewText: string | null;
  engines: OverviewEngine[];
  fetchedAt: string | null;
}

type TabStatus = "active" | "inactive";

const LOCATIONS = [
  { code: "us", name: "United States" },
  { code: "gb", name: "United Kingdom" },
  { code: "de", name: "Germany" },
  { code: "fr", name: "France" },
  { code: "es", name: "Spain" },
  { code: "it", name: "Italy" },
  { code: "nl", name: "Netherlands" },
  { code: "au", name: "Australia" },
  { code: "ca", name: "Canada" },
  { code: "br", name: "Brazil" },
  { code: "in", name: "India" },
  { code: "jp", name: "Japan" },
];

// ---- Metric Components ----

function VolumeScore({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted-foreground">—</span>;
  const colors: Record<number, string> = {
    1: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    2: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    3: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    4: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
    5: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  };
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`w-1.5 h-3 rounded-sm ${
            i <= score ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colors[score] || ""}`}>
        {score}
      </span>
    </div>
  );
}

function VisibilityBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const color =
    value >= 60
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
      : value >= 30
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
        : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  return (
    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-5 font-medium ${color}`}>
      {value}%
    </Badge>
  );
}

function SentimentBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const config: Record<string, { icon: typeof ThumbsUp; color: string; label: string }> = {
    positive: {
      icon: ThumbsUp,
      color: "text-emerald-600 dark:text-emerald-400",
      label: "Positive",
    },
    neutral: {
      icon: Minus,
      color: "text-slate-500 dark:text-slate-400",
      label: "Neutral",
    },
    negative: {
      icon: ThumbsDown,
      color: "text-red-500 dark:text-red-400",
      label: "Negative",
    },
  };
  const c = config[value] || config.neutral;
  const Icon = c.icon;
  return (
    <div className={`flex items-center gap-1 ${c.color}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-[10px] font-medium">{c.label}</span>
    </div>
  );
}

function PositionBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const color =
    value <= 3
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
      : value <= 6
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
        : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  return (
    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-5 font-mono ${color}`}>
      #{value}
    </Badge>
  );
}

function CompetitorsList({ competitors }: { competitors: PromptCompetitor[] }) {
  if (competitors.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  const shown = competitors.slice(0, 2);
  const rest = competitors.length - 2;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 flex-wrap">
        {shown.map((c) => (
          <Tooltip key={c.domain}>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 font-normal max-w-[80px] truncate cursor-default"
              >
                {c.name}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {c.domain}
            </TooltipContent>
          </Tooltip>
        ))}
        {rest > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-muted-foreground cursor-default">
                +{rest}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {competitors.slice(2).map((c) => c.name).join(", ")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

// ---- Main Page ----

export default function PromptsPage() {
  const { activeWorkspace } = useWorkspace();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabStatus>("active");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTopic, setFilterTopic] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");

  // Add prompt dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState<"single" | "multi" | "csv">("single");
  const [newPromptText, setNewPromptText] = useState("");
  const [multiPromptText, setMultiPromptText] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newLocation, setNewLocation] = useState("us");
  const [adding, setAdding] = useState(false);

  // Batch operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // AI Overview detail dialog
  const [overviewDialogOpen, setOverviewDialogOpen] = useState(false);
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // CSV upload
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Auto-polling refs
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingCountRef = useRef(0);

  // Fetch error tracking
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ---- Data Fetching ----

  const fetchPrompts = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      setFetchError(null);
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/queries`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || `Failed to load prompts (${res.status})`;
        setFetchError(msg);
        console.error("Fetch prompts error:", msg);
        return;
      }
      const data = await res.json();
      setPrompts(data.queries || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error loading prompts";
      setFetchError(msg);
      console.error("Fetch prompts error:", err);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  // Auto-polling: refresh metrics while background fetch runs
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollingCountRef.current = 0;
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollingCountRef.current = 0;
    pollingRef.current = setInterval(async () => {
      pollingCountRef.current++;
      await fetchPrompts();
      if (pollingCountRef.current >= 10) stopPolling(); // stop after ~30s
    }, 3000);
  }, [fetchPrompts, stopPolling]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    if (activeWorkspace) {
      setLoading(true);
      setFetchError(null);
      setPrompts([]);
      fetchPrompts();
    }
  }, [activeWorkspace, fetchPrompts]);

  // ---- AI Overview Detail ----

  const openOverview = async (promptId: string) => {
    if (!activeWorkspace) return;
    setOverviewDialogOpen(true);
    setOverviewLoading(true);
    setOverviewData(null);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/queries/${promptId}/overview`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast.error(err.error || `Failed to load AI Overview (${res.status})`);
        setOverviewDialogOpen(false);
        return;
      }
      const data = await res.json();
      setOverviewData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load AI Overview");
      setOverviewDialogOpen(false);
    } finally {
      setOverviewLoading(false);
    }
  };

  // ---- Derived Data ----

  const allTopics = useMemo(() => {
    const topics = new Set(prompts.map((p) => p.topic).filter(Boolean));
    return [...topics].sort();
  }, [prompts]);

  const allTags = useMemo(() => {
    const tags = new Set(prompts.flatMap((p) => p.tags || []));
    return [...tags].sort();
  }, [prompts]);

  const tabStatusMap: Record<TabStatus, string[]> = {
    active: ["active"],
    inactive: ["inactive", "paused"],
  };

  const filteredPrompts = useMemo(() => {
    return prompts.filter((p) => {
      if (!tabStatusMap[activeTab].includes(p.status)) return false;
      if (searchQuery && !p.queryText.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      if (filterTopic !== "all" && p.topic !== filterTopic) return false;
      if (filterTag !== "all" && !(p.tags || []).includes(filterTag)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts, activeTab, searchQuery, filterTopic, filterTag]);

  const tabCounts = useMemo(
    () => ({
      active: prompts.filter((p) => p.status === "active").length,
      inactive: prompts.filter((p) => ["inactive", "paused"].includes(p.status)).length,
    }),
    [prompts]
  );

  // ---- Actions ----

  const addPrompts = async () => {
    if (!activeWorkspace) return;
    setAdding(true);

    const textsToAdd: string[] = [];
    if (addMode === "single") {
      if (newPromptText.trim()) textsToAdd.push(newPromptText.trim());
    } else if (addMode === "multi") {
      const lines = multiPromptText
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      textsToAdd.push(...lines);
    }

    if (textsToAdd.length === 0) {
      setAdding(false);
      return;
    }

    const tags = newTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (textsToAdd.length === 1) {
        const res = await fetch(`/api/workspaces/${activeWorkspace.id}/queries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queryText: textsToAdd[0],
            topic: newTopic.trim(),
            tags,
            location: newLocation,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.message || err.error || `Failed (${res.status})`);
        }
        toast.success("Prompt added — fetching AI data...");
      } else {
        const res = await fetch(`/api/workspaces/${activeWorkspace.id}/queries/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queries: textsToAdd.map((t) => ({
              queryText: t,
              topic: newTopic.trim(),
              tags,
              location: newLocation,
            })),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.message || err.error || `Failed (${res.status})`);
        }
        const data = await res.json();
        toast.success(`Added ${data.created} prompts — fetching AI data...`);
      }

      // Refresh the full list from the server
      await fetchPrompts();
      startPolling();
      setAddDialogOpen(false);
      setNewPromptText("");
      setMultiPromptText("");
      setNewTopic("");
      setNewTags("");
      setActiveTab("active");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add prompt");
    } finally {
      setAdding(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspace) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length <= 1) {
      toast.error("CSV file is empty or has only headers");
      return;
    }

    const queries: { queryText: string; topic?: string; tags?: string[] }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols[0]) {
        queries.push({
          queryText: cols[0].slice(0, 200),
          topic: cols[1] || "",
          tags: cols.slice(2).filter(Boolean),
        });
      }
    }

    if (queries.length === 0) {
      toast.error("No valid prompts found in CSV");
      return;
    }

    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/queries/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      toast.success(`Imported ${data.created} prompts — fetching AI data...`);
      await fetchPrompts();
      startPolling();
      setActiveTab("active");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import CSV");
    }

    if (csvInputRef.current) csvInputRef.current.value = "";
    setAddDialogOpen(false);
  };

  const updatePromptStatus = async (id: string, status: string) => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/queries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      await fetchPrompts();
      if (status === "active") {
        toast.success("Prompt activated — fetching AI data...");
        startPolling();
      } else {
        toast.success(
          status === "inactive"
            ? "Prompt deactivated"
            : `Prompt ${status}`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update prompt");
    }
  };

  const deletePrompt = async (id: string) => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/queries/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      await fetchPrompts();
      toast.success("Prompt deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete prompt");
    }
  };

  // Batch operations
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredPrompts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPrompts.map((p) => p.id)));
    }
  };

  const batchUpdateStatus = async (status: string) => {
    if (selectedIds.size === 0 || !activeWorkspace) return;
    const promises = [...selectedIds].map((id) =>
      fetch(`/api/workspaces/${activeWorkspace.id}/queries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
    );
    await Promise.allSettled(promises);
    setSelectedIds(new Set());
    await fetchPrompts();
    toast.success(`Updated ${promises.length} prompts`);
    if (status === "active") startPolling();
  };

  const batchDelete = async () => {
    if (selectedIds.size === 0 || !activeWorkspace) return;
    const promises = [...selectedIds].map((id) =>
      fetch(`/api/workspaces/${activeWorkspace.id}/queries/${id}`, {
        method: "DELETE",
      })
    );
    await Promise.allSettled(promises);
    setSelectedIds(new Set());
    await fetchPrompts();
    toast.success(`Deleted ${promises.length} prompts`);
  };

  // ---- Render ----

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Select a workspace to manage prompts</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prompts"
        description="Create, organize, and manage prompts for AI visibility tracking"
        helpText="Prompts are conversational questions tracked in Google AI Overviews. Each prompt shows your brand's visibility, sentiment, source position, and which competitors appear alongside you."
        actions={
          <div className="flex items-center gap-2">
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Prompt
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Prompts</DialogTitle>
                  <DialogDescription>
                    Add prompts individually, in batches using line breaks, or upload a CSV file.
                  </DialogDescription>
                </DialogHeader>

                {/* Mode selector */}
                <div className="flex gap-1 bg-muted rounded-lg p-1">
                  {[
                    { id: "single" as const, label: "Single", icon: FileText },
                    { id: "multi" as const, label: "Multiple", icon: Zap },
                    { id: "csv" as const, label: "CSV Upload", icon: Upload },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-md transition-colors ${
                        addMode === mode.id
                          ? "bg-background shadow text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setAddMode(mode.id)}
                    >
                      <mode.icon className="h-3.5 w-3.5" />
                      {mode.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-4 pt-2">
                  {addMode === "single" && (
                    <div className="space-y-2">
                      <Label>Prompt (max 200 characters)</Label>
                      <Input
                        placeholder="What CRM would work best for a sales team of 10 people?"
                        value={newPromptText}
                        onChange={(e) => setNewPromptText(e.target.value.slice(0, 200))}
                        maxLength={200}
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {newPromptText.length}/200
                      </p>
                    </div>
                  )}

                  {addMode === "multi" && (
                    <div className="space-y-2">
                      <Label>Prompts (one per line, max 200 chars each)</Label>
                      <Textarea
                        placeholder={`What's the best project management tool for remote teams?\nHow do I choose a CRM for my startup?\nCompare the top email marketing platforms`}
                        value={multiPromptText}
                        onChange={(e) => setMultiPromptText(e.target.value)}
                        rows={6}
                      />
                      <p className="text-xs text-muted-foreground">
                        {multiPromptText.split(/\n/).filter((l) => l.trim()).length} prompts
                        {" · "}
                        Longest:{" "}
                        {Math.max(0, ...multiPromptText.split(/\n/).map((l) => l.trim().length))}
                        /200
                      </p>
                    </div>
                  )}

                  {addMode === "csv" && (
                    <div className="space-y-3">
                      <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-2">
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm font-medium">
                          Drag &amp; drop your CSV file or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Col 1: Prompt · Col 2: Topic (optional) · Col 3+: Tags (optional)
                        </p>
                        <input
                          ref={csvInputRef}
                          type="file"
                          accept=".csv,.txt"
                          className="hidden"
                          onChange={handleCsvUpload}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => csvInputRef.current?.click()}
                        >
                          Browse Files
                        </Button>
                      </div>
                    </div>
                  )}

                  {addMode !== "csv" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5" />
                            Location
                          </Label>
                          <Select value={newLocation} onValueChange={setNewLocation}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LOCATIONS.map((loc) => (
                                <SelectItem key={loc.code} value={loc.code}>
                                  {loc.name} ({loc.code.toUpperCase()})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1.5">
                            <FolderOpen className="h-3.5 w-3.5" />
                            Topic
                          </Label>
                          <Input
                            placeholder="e.g. Marketing Analytics"
                            value={newTopic}
                            onChange={(e) => setNewTopic(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5" />
                          Tags (comma-separated)
                        </Label>
                        <Input
                          placeholder="comparison, recommendation, brand"
                          value={newTags}
                          onChange={(e) => setNewTags(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>

                    </>
                  )}
                </div>

                {addMode !== "csv" && (
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={addPrompts}
                      disabled={
                        adding ||
                        (addMode === "single" && !newPromptText.trim()) ||
                        (addMode === "multi" &&
                          !multiPromptText.split(/\n/).some((l) => l.trim()))
                      }
                    >
                      {adding ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-1.5" />
                      )}
                      Add
                    </Button>
                  </DialogFooter>
                )}
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {/* Summary stats for active tab */}
      {activeTab === "active" && tabCounts.active > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/10 p-1.5">
                <Hash className="h-3.5 w-3.5 text-primary" />
              </div>
              <div>
                <p className="text-lg font-bold leading-none">{tabCounts.active}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Active Prompts</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-emerald-100 dark:bg-emerald-900/30 p-1.5">
                <Eye className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold leading-none">
                  {(() => {
                    const withVis = prompts.filter((p) => p.status === "active" && p.visibility !== null);
                    if (withVis.length === 0) return "—";
                    return Math.round(withVis.reduce((a, b) => a + (b.visibility || 0), 0) / withVis.length) + "%";
                  })()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Avg Visibility</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-blue-100 dark:bg-blue-900/30 p-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-lg font-bold leading-none">
                  {(() => {
                    const withPos = prompts.filter((p) => p.status === "active" && p.avgPosition !== null);
                    if (withPos.length === 0) return "—";
                    return "#" + (Math.round(withPos.reduce((a, b) => a + (b.avgPosition || 0), 0) / withPos.length * 10) / 10);
                  })()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Avg Position</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-violet-100 dark:bg-violet-900/30 p-1.5">
                <Users className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-lg font-bold leading-none">
                  {(() => {
                    const allComps = new Set<string>();
                    prompts.filter((p) => p.status === "active").forEach((p) =>
                      (p.competitors || []).forEach((c) => allComps.add(c.domain))
                    );
                    return allComps.size || "—";
                  })()}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Competitors Seen</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tabs + Filters */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as TabStatus);
              setSelectedIds(new Set());
            }}
          >
            <TabsList className="h-9">
              <TabsTrigger value="active" className="text-xs px-4 gap-1.5">
                <Play className="h-3.5 w-3.5" />
                Active
                {tabCounts.active > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                    {tabCounts.active}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="inactive" className="text-xs px-4 gap-1.5">
                <Pause className="h-3.5 w-3.5" />
                Inactive
                {tabCounts.inactive > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                    {tabCounts.inactive}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search prompts…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-[200px] pl-8 text-xs"
              />
            </div>
            {allTopics.length > 0 && (
              <Select value={filterTopic} onValueChange={setFilterTopic}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <FolderOpen className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <SelectValue placeholder="Topic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Topics</SelectItem>
                  {allTopics.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {allTags.length > 0 && (
              <Select value={filterTag} onValueChange={setFilterTag}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <Tag className="h-3.5 w-3.5 mr-1 shrink-0" />
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {allTags.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Batch actions bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border text-sm">
            <span className="font-medium">{selectedIds.size} selected</span>
            <span className="text-muted-foreground">·</span>
            {activeTab === "active" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => batchUpdateStatus("inactive")}
              >
                <Pause className="h-3 w-3 mr-1" />
                Deactivate
              </Button>
            )}
            {activeTab === "inactive" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => batchUpdateStatus("active")}
              >
                <Play className="h-3 w-3 mr-1" />
                Activate
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={batchDelete}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete
            </Button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : fetchError ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4 mb-4">
                <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold mb-1">Failed to load prompts</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                {fetchError}
              </p>
              <Button
                onClick={() => {
                  setLoading(true);
                  setFetchError(null);
                  fetchPrompts();
                }}
              >
                <Zap className="h-4 w-4 mr-1.5" />
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : filteredPrompts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">
                {searchQuery || filterTopic !== "all" || filterTag !== "all"
                  ? "No prompts match your filters"
                  : activeTab === "inactive"
                    ? "No inactive prompts"
                    : "No prompts yet"}
              </h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                {activeTab === "active"
                  ? "Add prompts manually to get started with visibility tracking."
                  : activeTab === "inactive"
                    ? "Deactivated prompts appear here. Their historical data is preserved."
                    : "No prompts match your current filters."}
              </p>
              {activeTab === "active" && (
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Your First Prompt
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          /* ========== Prompts Table ========== */
          <Card>
            <CardContent className="p-0">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            filteredPrompts.length > 0 &&
                            selectedIds.size === filteredPrompts.length
                          }
                          onCheckedChange={toggleSelectAll}
                          className="h-3.5 w-3.5"
                        />
                      </TableHead>
                      <TableHead className="min-w-[220px]">Prompt</TableHead>
                      <TableHead className="w-[100px]">
                        <span className="flex items-center gap-1">
                          <FolderOpen className="h-3 w-3" />
                          Topic
                        </span>
                      </TableHead>
                      <TableHead className="w-[110px]">
                        <span className="flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          Tags
                        </span>
                      </TableHead>
                      <TableHead className="w-[70px]">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          Visibility
                        </span>
                      </TableHead>
                      <TableHead className="w-[85px]">Sentiment</TableHead>
                      <TableHead className="w-[60px]">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Pos.
                        </span>
                      </TableHead>
                      <TableHead className="w-[120px]">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Competitors
                        </span>
                      </TableHead>
                      <TableHead className="w-[55px]">
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          Loc.
                        </span>
                      </TableHead>
                      <TableHead className="w-[80px]">
                        <span className="flex items-center gap-1">
                          <BarChart3 className="h-3 w-3" />
                          Volume
                        </span>
                      </TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPrompts.map((p) => (
                      <TableRow key={p.id} className="group">
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(p.id)}
                            onCheckedChange={() =>
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                                return next;
                              })
                            }
                            className="h-3.5 w-3.5"
                          />
                        </TableCell>
                        {/* Prompt text */}
                        <TableCell>
                          <div className="min-w-0">
                            <button
                              className="text-sm font-medium leading-snug truncate max-w-[280px] text-left hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer block"
                              onClick={() => openOverview(p.id)}
                              title="View AI Overview"
                            >
                              {p.queryText}
                            </button>
                            <div className="flex items-center gap-2 mt-0.5">
                              {p.lastFetchedAt && (
                                <span className="text-[10px] text-muted-foreground">
                                  Last run:{" "}
                                  {new Date(p.lastFetchedAt).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              )}
                              {p.status === "suggested" && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                                >
                                  Suggested
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        {/* Topic */}
                        <TableCell>
                          {p.topic && p.topic.trim() !== "" ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-5 font-normal max-w-[100px] truncate"
                            >
                              <FolderOpen className="h-2.5 w-2.5 mr-1 shrink-0" />
                              <span className="truncate">{p.topic}</span>
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {/* Tags */}
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(p.tags) && p.tags.length > 0 ? (
                              <>
                                {p.tags.slice(0, 2).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 h-4 font-normal"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                                {p.tags.length > 2 && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-[10px] text-muted-foreground cursor-default">
                                          +{p.tags.length - 2}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs">
                                        {p.tags.slice(2).join(", ")}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        {/* Visibility */}
                        <TableCell>
                          <VisibilityBadge value={p.visibility} />
                        </TableCell>
                        {/* Sentiment */}
                        <TableCell>
                          <SentimentBadge value={p.sentiment} />
                        </TableCell>
                        {/* Position */}
                        <TableCell>
                          <PositionBadge value={p.avgPosition} />
                        </TableCell>
                        {/* Competitors */}
                        <TableCell>
                          <CompetitorsList competitors={p.competitors || []} />
                        </TableCell>
                        {/* Location */}
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5 font-mono uppercase"
                          >
                            {p.location || "us"}
                          </Badge>
                        </TableCell>
                        {/* Volume */}
                        <TableCell>
                          <VolumeScore score={p.promptVolume} />
                        </TableCell>
                        {/* Actions */}
                        <TableCell>
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {p.status === "active" ? (
                                  <DropdownMenuItem
                                    onClick={() => updatePromptStatus(p.id, "inactive")}
                                  >
                                    <Pause className="h-3.5 w-3.5 mr-2" />
                                    Deactivate
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => updatePromptStatus(p.id, "active")}
                                  >
                                    <Play className="h-3.5 w-3.5 mr-2" />
                                    Activate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => deletePrompt(p.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      {/* How Prompts Work — educational footer card */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            How Prompts Work
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong>Prompts vs Keywords:</strong> Traditional SEO uses short keywords. AI search
            requires conversational questions with intent and context — e.g. &quot;What CRM would
            work best for a sales team of 10 people?&quot;
          </p>
          <p>
            <strong>Metrics:</strong> Each tracked prompt shows your brand&apos;s <strong>visibility</strong> (% of AI responses mentioning you),{" "}
            <strong>sentiment</strong> (how AI describes you), <strong>position</strong> (where you rank among sources),
            and which <strong>competitors</strong> appear in the same responses.
          </p>
          <p>
            <strong>Topics &amp; Tags:</strong> Organize prompts into topics (like folders) for analysis.
            Tags enable cross-cutting categorization. Track visibility at the topic level to spot trends.
          </p>
        </CardContent>
      </Card>

      {/* AI Overview Detail Dialog */}
      <Dialog open={overviewDialogOpen} onOpenChange={setOverviewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bot className="h-5 w-5 text-primary" />
              AI Overview
            </DialogTitle>
            {overviewData && (
              <DialogDescription className="text-sm">
                <span className="font-medium text-foreground">&quot;{overviewData.queryText}&quot;</span>
                {overviewData.fetchedAt && (
                  <span className="text-muted-foreground ml-2">
                    — fetched{" "}
                    {new Date(overviewData.fetchedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1 -mr-1">
            {overviewLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!overviewLoading && overviewData && !overviewData.overviewText && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  No AI Overview data available yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Data will appear here once the prompt has been fetched.
                </p>
              </div>
            )}

            {!overviewLoading &&
              overviewData?.engines?.map((eng) => (
                <div key={eng.engine} className="space-y-3">
                  {/* AI Overview Text */}
                  {eng.overviewText && (
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          AI-Generated Response
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {eng.overviewText}
                      </p>
                    </div>
                  )}

                  {/* Sources */}
                  {eng.sources.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        Cited Sources ({eng.sources.length})
                      </h4>
                      <div className="space-y-2">
                        {eng.sources.map((source, idx) => (
                          <div
                            key={idx}
                            className={`rounded-lg border p-3 text-sm transition-colors ${
                              source.isBrandMentioned
                                ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30"
                                : source.competitorDomain
                                  ? "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20"
                                  : "bg-background"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <span className="text-xs font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                                  #{source.position}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <a
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm font-medium hover:underline text-primary truncate block max-w-[400px]"
                                    >
                                      {source.title || source.url}
                                    </a>
                                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                                  </div>
                                  {source.title && (
                                    <p className="text-[11px] text-muted-foreground truncate max-w-[400px] mt-0.5">
                                      {source.url}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Source badges */}
                              <div className="flex items-center gap-1 shrink-0">
                                {source.isBrandMentioned && (
                                  <Badge className="text-[10px] px-1.5 py-0 h-5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 hover:bg-emerald-100">
                                    <Eye className="h-2.5 w-2.5 mr-0.5" />
                                    Your Brand
                                  </Badge>
                                )}
                                {source.competitorDomain && !source.isBrandMentioned && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
                                    <Users className="h-2.5 w-2.5 mr-0.5" />
                                    {source.competitorDomain}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Snippet */}
                            {source.snippet && (
                              <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed pl-7">
                                {source.snippet}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
