"use client";

import { useWorkspace } from "@/components/workspace-provider";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Plus,
  RefreshCw,
  MoreHorizontal,
  Pause,
  Play,
  Archive,
  Trash2,
  ExternalLink,
  Loader2,
  Upload,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/loading-skeletons";

interface TrackedQuery {
  id: string;
  queryText: string;
  status: "active" | "paused" | "archived";
  lastFetchedAt: string | null;
  createdAt: string;
}

export default function QueriesPage() {
  const { activeWorkspace } = useWorkspace();
  const router = useRouter();
  const [queries, setQueries] = useState<TrackedQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [newQueryText, setNewQueryText] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspace) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) {
      toast.error("CSV file is empty");
      return;
    }

    // Detect header row
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes("query") || header.includes("keyword") || header.includes("text");
    const dataLines = hasHeader ? lines.slice(1) : lines;

    // Parse: support "queryText,searchVolume" or just "queryText"
    const parseItems = dataLines
      .map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
        return {
          queryText: cols[0] || "",
          searchVolume: parseInt(cols[1]) || 0,
        };
      })
      .filter((item) => item.queryText);

    if (parseItems.length === 0) {
      toast.error("No valid queries found in CSV");
      return;
    }

    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/queries/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries: parseItems }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchQueries();
      } else {
        toast.error(data.error || "Failed to import CSV");
      }
    } catch {
      toast.error("Failed to import CSV");
    }
    // Reset file input
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const handleExportCsv = () => {
    const csvRows = [
      ["Query", "Status", "Last Fetched", "Created"].join(","),
      ...queries.map((q) =>
        [
          `"${q.queryText.replace(/"/g, '""')}"`,
          q.status,
          q.lastFetchedAt ? new Date(q.lastFetchedAt).toISOString() : "",
          new Date(q.createdAt).toISOString(),
        ].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `queries-${activeWorkspace?.name || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchQueries = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/queries`
      );
      if (res.ok) {
        const data = await res.json();
        setQueries(data.queries);
      } else {
        toast.error("Failed to load queries");
      }
    } catch {
      toast.error("Failed to load queries");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  const handleAddQuery = async () => {
    if (!activeWorkspace || !newQueryText.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/queries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queryText: newQueryText.trim(),
          }),
        }
      );
      if (res.ok) {
        toast.success("Query added successfully");
        setNewQueryText("");
        setAddDialogOpen(false);
        fetchQueries();
      } else {
        const data = await res.json();
        toast.error(data.message || data.error || "Failed to add query");
      }
    } catch {
      toast.error("Failed to add query");
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChange = async (
    queryId: string,
    status: "active" | "paused" | "archived"
  ) => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/queries/${queryId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (res.ok) {
        toast.success(`Query ${status}`);
        fetchQueries();
      } else {
        toast.error("Failed to update query");
      }
    } catch {
      toast.error("Failed to update query");
    }
  };

  const handleDelete = async (queryId: string) => {
    if (!activeWorkspace) return;
    if (!confirm("Delete this query and all its results? This cannot be undone."))
      return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/queries/${queryId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast.success("Query deleted");
        fetchQueries();
      } else {
        toast.error("Failed to delete query");
      }
    } catch {
      toast.error("Failed to delete query");
    }
  };

  const handleFetchNow = async (queryId: string) => {
    if (!activeWorkspace) return;
    setFetchingIds((prev) => new Set(prev).add(queryId));
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/queries/${queryId}/fetch`,
        { method: "POST" }
      );
      const data = await res.json();
      if (res.ok) {
        if (data.overview) {
          const vis = data.overview.brandTextVisibility ?? 0;
          toast.success(
            `Fetched: ${data.overview.sourcesCount} sources found${
              vis > 0 ? ` — brand visibility: ${vis}%` : ""
            }`
          );
        } else {
          toast.info(data.message || "No AI Overview found for this query");
        }
        fetchQueries();
      } else {
        toast.error(data.error || "Failed to fetch AI Overview");
      }
    } catch {
      toast.error("Failed to fetch AI Overview");
    } finally {
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.delete(queryId);
        return next;
      });
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Select a workspace first</p>
      </div>
    );
  }

  const activeQueries = queries.filter((q) => q.status === "active");
  const pausedQueries = queries.filter((q) => q.status === "paused");
  const archivedQueries = queries.filter((q) => q.status === "archived");

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Tracked Queries"
        description={`Monitor keywords in Google AI Overviews for ${activeWorkspace.name}`}
        helpText="Add keywords to automatically track whether your domain appears in AI Overviews. Results are fetched daily at 2 AM UTC."
        actions={
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".csv,.txt"
            ref={csvInputRef}
            className="hidden"
            onChange={handleCsvUpload}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => csvInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" />
            Import CSV
          </Button>
          {queries.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={fetchQueries}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Query
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Tracked Query</DialogTitle>
                <DialogDescription>
                  Enter a keyword or query to monitor in Google AI Overviews.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label>Query Text</Label>
                  <Input
                    placeholder='e.g. "best project management tools"'
                    value={newQueryText}
                    onChange={(e) => setNewQueryText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newQueryText.trim()) {
                        handleAddQuery();
                      }
                    }}
                  />
                </div>

              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddQuery}
                  disabled={adding || !newQueryText.trim()}
                >
                  {adding && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Add Query
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Queries</CardDescription>
            <CardTitle className="text-2xl">{activeQueries.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paused</CardDescription>
            <CardTitle className="text-2xl">{pausedQueries.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Tracked</CardDescription>
            <CardTitle className="text-2xl">{queries.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Queries Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={6} />
      ) : queries.length === 0 ? (
        <Card>
          <CardHeader className="text-center">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <CardTitle>No Queries Yet</CardTitle>
            <CardDescription>
              Add your first query to start monitoring AI Overviews. Click
              &quot;Add Query&quot; above to get started.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Queries</CardTitle>
            <CardDescription>
              Click a query to view detailed results, or use the menu to manage
              it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Fetched</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queries.map((q) => (
                  <TableRow key={q.id} className="group">
                    <TableCell>
                      <button
                        className="flex items-center gap-2 text-left hover:underline font-medium"
                        onClick={() =>
                          router.push(`/dashboard/queries/${q.id}`)
                        }
                      >
                        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                        {q.queryText}
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={q.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {q.lastFetchedAt
                        ? new Date(q.lastFetchedAt).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(q.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={
                            fetchingIds.has(q.id) || q.status !== "active"
                          }
                          onClick={() => handleFetchNow(q.id)}
                          title="Fetch now"
                        >
                          {fetchingIds.has(q.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                router.push(`/dashboard/queries/${q.id}`)
                              }
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {q.status === "active" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(q.id, "paused")
                                }
                              >
                                <Pause className="h-4 w-4 mr-2" />
                                Pause
                              </DropdownMenuItem>
                            ) : q.status === "paused" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(q.id, "active")
                                }
                              >
                                <Play className="h-4 w-4 mr-2" />
                                Resume
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(q.id, "archived")
                              }
                            >
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(q.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Archived section */}
      {archivedQueries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Archived ({archivedQueries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {archivedQueries.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between text-sm text-muted-foreground"
                >
                  <span>{q.queryText}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStatusChange(q.id, "active")}
                    >
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDelete(q.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active":
      return (
        <Badge variant="default" className="bg-green-600">
          Active
        </Badge>
      );
    case "paused":
      return <Badge variant="secondary">Paused</Badge>;
    case "archived":
      return <Badge variant="outline">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
