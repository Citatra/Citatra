"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Globe,
  Trash2,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export type AnalysisType =
  | "html-audit"
  | "schema-generator"
  | "semantic-map"
  | "geo-audit";

interface AnalysisSummary {
  score?: number;
  errors?: number;
  warnings?: number;
  infos?: number;
  totalIssues?: number;
  schemaCount?: number;
  schemaTypes?: string[];
  entityCount?: number;
  topicCount?: number;
  topicsMissing?: number;
  pageTitle?: string;
}

interface PageAnalysisRecord {
  _id: string;
  url: string;
  status: "success" | "failed";
  summary: AnalysisSummary;
  result: Record<string, unknown>;
  errorMessage?: string;
  analyzedAt: string;
}

interface BulkSiteAnalyzerProps {
  workspaceId: string;
  analysisType: AnalysisType;
  /** Called when the user clicks a row to load that analysis into the main view */
  onSelectResult: (result: Record<string, unknown>, url: string) => void;
}

function scoreColor(score?: number): string {
  if (score === undefined) return "";
  if (score >= 80) return "text-green-600 font-semibold";
  if (score >= 50) return "text-yellow-600 font-semibold";
  return "text-red-600 font-semibold";
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateUrl(url: string, max = 55): string {
  try {
    const u = new URL(url);
    const path = u.hostname + u.pathname;
    return path.length > max ? `${path.slice(0, max)}…` : path;
  } catch {
    return url.length > max ? `${url.slice(0, max)}…` : url;
  }
}

const ANALYSIS_LABELS: Record<AnalysisType, string> = {
  "html-audit": "HTML Audit",
  "schema-generator": "Schema Generator",
  "semantic-map": "Semantic Map",
  "geo-audit": "GEO Audit",
};

export function BulkSiteAnalyzer({
  workspaceId,
  analysisType,
  onSelectResult,
}: BulkSiteAnalyzerProps) {
  const [results, setResults] = useState<PageAnalysisRecord[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loadingResults, setLoadingResults] = useState(true);

  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/page-analyses?analysisType=${analysisType}`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoadingResults(false);
    }
  }, [workspaceId, analysisType]);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/page-analyses/bulk-analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisType }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Analysis failed");
        return;
      }
      toast.success(
        `Analyzed ${data.analyzed} page${data.analyzed !== 1 ? "s" : ""} from your site`
      );
      setResults(data.results ?? []);
    } catch {
      toast.error("Failed to run bulk analysis");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/page-analyses?analysisType=${analysisType}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setResults([]);
        toast.success("Results cleared");
      }
    } catch {
      toast.error("Failed to clear results");
    } finally {
      setClearing(false);
    }
  };

  // ── Column renderers ─────────────────────────────────────────────────────

  function renderHeaders() {
    const base = (
      <>
        <TableHead>URL</TableHead>
        <TableHead>Status</TableHead>
      </>
    );
    switch (analysisType) {
      case "html-audit":
        return (
          <>
            {base}
            <TableHead>Score</TableHead>
            <TableHead>Errors</TableHead>
            <TableHead>Warnings</TableHead>
            <TableHead>Info</TableHead>
          </>
        );
      case "schema-generator":
        return (
          <>
            {base}
            <TableHead>Schema Types</TableHead>
            <TableHead>Count</TableHead>
          </>
        );
      case "semantic-map":
        return (
          <>
            {base}
            <TableHead>Title</TableHead>
            <TableHead>Entities</TableHead>
            <TableHead>Topics</TableHead>
            <TableHead>Missing</TableHead>
          </>
        );
      case "geo-audit":
        return (
          <>
            {base}
            <TableHead>Score</TableHead>
            <TableHead>Issues</TableHead>
            <TableHead>Errors</TableHead>
          </>
        );
    }
  }

  function renderCells(r: PageAnalysisRecord) {
    const s = r.summary;
    switch (analysisType) {
      case "html-audit":
        return (
          <>
            <TableCell>
              {s.score ?? "—"}
            </TableCell>
            <TableCell>
              {s.errors ?? "—"}
            </TableCell>
            <TableCell>
              {s.warnings ?? "—"}
            </TableCell>
            <TableCell>
              {s.infos ?? "—"}
            </TableCell>
          </>
        );
      case "schema-generator":
        return (
          <>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {s.schemaTypes?.length
                  ? s.schemaTypes.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {t}
                      </Badge>
                    ))
                  : <span className="text-muted-foreground text-xs">None</span>}
              </div>
            </TableCell>
            <TableCell>{s.schemaCount ?? "—"}</TableCell>
          </>
        );
      case "semantic-map":
        return (
          <>
            <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">
              {s.pageTitle ?? "—"}
            </TableCell>
            <TableCell>
              {s.entityCount ?? "—"}
            </TableCell>
            <TableCell>
              {s.topicCount ?? "—"}
            </TableCell>
            <TableCell>
              {s.topicsMissing ?? "—"}
            </TableCell>
          </>
        );
      case "geo-audit":
        return (
          <>
            <TableCell className="text-white">{s.score ?? "—"}</TableCell>
            <TableCell className="text-white">{s.totalIssues ?? "—"}</TableCell>
            <TableCell className="text-white">{s.errors ?? "—"}</TableCell>
          </>
        );
    }
  }

  const label = ANALYSIS_LABELS[analysisType];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-primary" />
              Bulk Site Analysis
            </CardTitle>
            <CardDescription className="mt-1">
              Automatically fetches up to 15 real pages from your website and
              runs {label} on each. Click any row to load its result.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {results.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={clearing || analyzing}
              >
                {clearing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span className="ml-1 hidden sm:inline">Clear</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchSaved}
              disabled={loadingResults || analyzing}
            >
              <RefreshCw className={`h-4 w-4 ${loadingResults ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Globe className="h-4 w-4 mr-2" />
              )}
              {analyzing ? "Analyzing…" : "Fetch & Analyze Pages"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loadingResults ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading saved results…
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center text-muted-foreground">
            <Globe className="h-10 w-10 opacity-20" />
            <p className="text-sm">No pages analyzed yet.</p>
            <p className="text-xs">
              Click <strong>Fetch &amp; Analyze 15 Pages</strong> to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {renderHeaders()}
                  <TableHead>Analyzed</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow
                    key={r._id}
                    className={
                      r.status === "success"
                        ? "cursor-pointer hover:bg-muted/50 transition-colors"
                        : "opacity-60"
                    }
                    onClick={() => {
                      if (r.status === "success") {
                        onSelectResult(r.result, r.url);
                        toast.info("Result loaded — scroll up to view details");
                      }
                    }}
                  >
                    <TableCell className="font-mono text-xs max-w-[220px] truncate">
                      <span title={r.url}>{truncateUrl(r.url)}</span>
                    </TableCell>
                    <TableCell>
                      {r.status === "success" ? (
                        <Badge
                          variant="outline"
                          className="text-green-600 border-green-300 gap-1"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          OK
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-red-600 border-red-300 gap-1"
                          title={r.errorMessage}
                        >
                          <XCircle className="h-3 w-3" />
                          Failed
                        </Badge>
                      )}
                    </TableCell>
                    {renderCells(r)}
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(r.analyzedAt)}
                    </TableCell>
                    <TableCell>
                      {r.status === "success" && (
                        <Button variant="ghost" size="sm" className="h-7 px-2">
                          <ChevronRight className="h-4 w-4" />
                          <span className="sr-only">Load</span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
