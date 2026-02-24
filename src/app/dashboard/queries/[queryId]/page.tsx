"use client";

import { useWorkspace } from "@/components/workspace-provider";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  Globe,
  Clock,
  Hash,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatGridSkeleton, TableSkeleton } from "@/components/loading-skeletons";

interface QueryDetail {
  id: string;
  queryText: string;
  status: "active" | "paused" | "archived";
  lastFetchedAt: string | null;
  createdAt: string;
}

interface TrackingResultItem {
  id: string;
  contentSnippet: string;
  sourceUrl: string;
  engine: string;
  isBrandMentioned: boolean;
  brandTextVisibility: number;
  mentionType: "explicit" | "implicit" | "none";
  sentiment: "positive" | "neutral" | "negative";
  sourcePosition: number;
  competitorDomain: string | null;
  overviewText: string;
  metadata: Record<string, unknown>;
  fetchedAt: string;
  createdAt: string;
}

interface LatestResult {
  id: string;
  contentSnippet: string;
  sourceUrl: string;
  engine: string;
  isBrandMentioned: boolean;
  brandTextVisibility: number;
  mentionType: string;
  sentiment: string;
  sourcePosition: number;
  competitorDomain: string | null;
  overviewText: string;
  metadata: Record<string, unknown>;
  fetchedAt: string;
}

export default function QueryDetailPage() {
  const { activeWorkspace } = useWorkspace();
  const params = useParams();
  const router = useRouter();
  const queryId = params.queryId as string;

  const [query, setQuery] = useState<QueryDetail | null>(null);
  const [latestResult, setLatestResult] = useState<LatestResult | null>(null);
  const [results, setResults] = useState<TrackingResultItem[]>([]);
  const [resultsCount, setResultsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);

  const fetchQueryDetail = useCallback(async () => {
    if (!activeWorkspace || !queryId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/queries/${queryId}`
      );
      if (res.ok) {
        const data = await res.json();
        setQuery(data.query);
        setLatestResult(data.latestResult);
        setResultsCount(data.resultsCount);
      } else if (res.status === 404) {
        toast.error("Query not found");
        router.push("/dashboard/queries");
      } else {
        toast.error("Failed to load query");
      }
    } catch {
      toast.error("Failed to load query");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, queryId, router]);

  const fetchResults = useCallback(async () => {
    if (!activeWorkspace || !queryId) return;
    setLoadingResults(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/queries/${queryId}/results`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    } catch {
      toast.error("Failed to load results");
    } finally {
      setLoadingResults(false);
    }
  }, [activeWorkspace, queryId]);

  useEffect(() => {
    fetchQueryDetail();
  }, [fetchQueryDetail]);

  useEffect(() => {
    if (query) {
      fetchResults();
    }
  }, [query, fetchResults]);

  const handleFetchNow = async () => {
    if (!activeWorkspace || !queryId) return;
    setFetching(true);
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
              vis > 0
                ? ` — brand visibility: ${vis}%`
                : ""
            }`
          );
        } else {
          toast.info(data.message || "No AI Overview found for this query");
        }
        fetchQueryDetail();
        fetchResults();
      } else {
        toast.error(data.error || "Failed to fetch AI Overview");
      }
    } catch {
      toast.error("Failed to fetch AI Overview");
    } finally {
      setFetching(false);
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Select a workspace first</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={4} />
        <TableSkeleton rows={5} cols={5} />
      </div>
    );
  }

  if (!query) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Query not found</p>
      </div>
    );
  }

  // Calculate stats from results
  const avgBrandVisibility = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.brandTextVisibility || 0), 0) / results.length)
    : 0;
  const uniqueFetchDates = [
    ...new Set(
      results.map((r) => new Date(r.fetchedAt).toLocaleDateString())
    ),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={query.queryText}
        description={`Created ${new Date(query.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/dashboard/queries")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <StatusBadge status={query.status} />
            <Button
              onClick={handleFetchNow}
              disabled={fetching || query.status !== "active"}
            >
              {fetching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Fetch Now
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              Total Results
            </CardDescription>
            <CardTitle className="text-2xl">{resultsCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Brand Visibility
            </CardDescription>
            <CardTitle className="text-2xl">{avgBrandVisibility}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              Unique Sources
            </CardDescription>
            <CardTitle className="text-2xl">
              {new Set(results.map((r) => r.sourceUrl).filter(Boolean)).size}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Fetch Sessions
            </CardDescription>
            <CardTitle className="text-2xl">
              {uniqueFetchDates.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Latest Result */}
      {latestResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest AI Overview</CardTitle>
            <CardDescription>
              Fetched{" "}
              {new Date(latestResult.fetchedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {latestResult.overviewText && (
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                    Full AI Overview text
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 p-3 rounded-md max-h-60 overflow-y-auto">
                    {latestResult.overviewText}
                  </p>
                </details>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {latestResult.contentSnippet}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <VisibilityBadge
                  score={latestResult.brandTextVisibility}
                  isCited={latestResult.isBrandMentioned}
                  type={latestResult.mentionType}
                />
                <SentimentBadge sentiment={latestResult.sentiment} />
                {latestResult.sourcePosition > 0 && (
                  <Badge variant="secondary">
                    Position #{latestResult.sourcePosition}
                  </Badge>
                )}
                {latestResult.competitorDomain && (
                  <Badge variant="destructive" className="text-xs">
                    Competitor: {latestResult.competitorDomain}
                  </Badge>
                )}
                {latestResult.sourceUrl && (
                  <a
                    href={latestResult.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary flex items-center gap-1 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {new URL(latestResult.sourceUrl).hostname}
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Results */}
      <Card>
        <CardHeader>
          <CardTitle>Tracking History</CardTitle>
          <CardDescription>
            All fetched results for this query, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingResults ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No results yet. Click &quot;Fetch Now&quot; to get the first AI Overview data.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Pos</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Snippet</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Competitor</TableHead>
                  <TableHead>Sentiment</TableHead>
                  <TableHead>Fetched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-center font-mono text-sm">
                      {r.sourcePosition > 0 ? `#${r.sourcePosition}` : "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {r.sourceUrl ? (
                        <a
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary flex items-center gap-1 hover:underline truncate"
                          title={r.sourceUrl}
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {(() => {
                              try {
                                return new URL(r.sourceUrl).hostname;
                              } catch {
                                return r.sourceUrl;
                              }
                            })()}
                          </span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          No source URL
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="text-sm text-muted-foreground truncate">
                        {r.contentSnippet.substring(0, 120)}
                        {r.contentSnippet.length > 120 ? "…" : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <VisibilityBadge
                        score={r.brandTextVisibility}
                        isCited={r.isBrandMentioned}
                        type={r.mentionType}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.competitorDomain || "—"}
                    </TableCell>
                    <TableCell>
                      <SentimentBadge sentiment={r.sentiment} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(r.fetchedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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

function VisibilityBadge({
  score,
  isCited,
  type,
}: {
  score: number;
  isCited: boolean;
  type: string;
}) {
  if (score <= 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <XCircle className="h-3 w-3" />
        Not mentioned
      </span>
    );
  }
  const color =
    score >= 70 ? "text-green-600" : score >= 30 ? "text-yellow-600" : "text-orange-500";
  return (
    <span className={`flex items-center gap-1 text-xs ${color}`}>
      <CheckCircle2 className="h-3 w-3" />
      {score}% visibility
      {isCited && (
        <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
          {type === "explicit" ? "Cited" : "Ref"}
        </Badge>
      )}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  switch (sentiment) {
    case "positive":
      return (
        <Badge
          variant="outline"
          className="border-green-500 text-green-600 text-xs"
        >
          Positive
        </Badge>
      );
    case "negative":
      return (
        <Badge
          variant="outline"
          className="border-red-500 text-red-600 text-xs"
        >
          Negative
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs">
          Neutral
        </Badge>
      );
  }
}
