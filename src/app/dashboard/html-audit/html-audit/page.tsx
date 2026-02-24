"use client";

import { useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Info, XCircle, FileCode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { BulkSiteAnalyzer } from "@/components/bulk-site-analyzer";

interface AuditIssue {
  id: string;
  severity: "error" | "warning" | "info";
  category: string;
  element: string;
  message: string;
  suggestion: string;
  line?: number;
}

interface AuditResult {
  url: string;
  score: number;
  issues: AuditIssue[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    totalIssues: number;
    headingsFound: number;
  };
}

export default function HtmlAuditPage() {
  const { activeWorkspace } = useWorkspace();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">("all");

  const runAudit = async () => {
    if (!activeWorkspace || !url) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/html-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Audit failed");
      const data = await res.json();
      setResult(data);
    } catch {
      toast.error("Failed to run audit");
    } finally {
      setLoading(false);
    }
  };

  const filteredIssues = result?.issues.filter(
    (i) => filter === "all" || i.severity === filter
  );

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "info":
        return <Info className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Semantic HTML Audit"
        description="Analyze your page's semantic structure, heading hierarchy, accessibility, and schema alignment."
        helpText="Enter a URL to audit its HTML structure. The tool checks heading levels, ARIA attributes, semantic elements, and schema.org markup."
      />

      <Card>
        <CardHeader>
          <CardTitle>Run Audit</CardTitle>
          <CardDescription>Enter a URL to analyze its HTML structure</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="https://example.com/page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button onClick={runAudit} disabled={loading || !url}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileCode className="h-4 w-4 mr-2" />}
              Audit
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <span className="inline-flex items-center justify-center px-4 py-1 rounded-md text-2xl font-bold text-white">
                  {result.score}
                </span>
                <p className="text-sm text-muted-foreground mt-1">Health Score</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <span className="inline-flex items-center justify-center px-3 py-1 rounded-md text-2xl font-bold text-white">{result.summary.errors}</span>
                <p className="text-sm text-muted-foreground mt-1">Errors</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <span className="inline-flex items-center justify-center px-3 py-1 rounded-md text-2xl font-bold text-white">{result.summary.warnings}</span>
                <p className="text-sm text-muted-foreground mt-1">Warnings</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <span className="inline-flex items-center justify-center px-3 py-1 rounded-md text-2xl font-bold text-white">{result.summary.infos}</span>
                <p className="text-sm text-muted-foreground mt-1">Info</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <span className="inline-flex items-center justify-center px-3 py-1 rounded-md text-2xl font-bold text-white">{result.summary.headingsFound}</span>
                <p className="text-sm text-muted-foreground mt-1">Headings</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Issues ({filteredIssues?.length || 0})</CardTitle>
                <div className="flex gap-2">
                  {(["all", "error", "warning", "info"] as const).map((f) => (
                    <Button
                      key={f}
                      variant={filter === f ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilter(f)}
                    >
                      {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredIssues?.map((issue) => (
                  <div key={issue.id} className="border rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      {severityIcon(issue.severity)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{issue.message}</span>
                          <Badge variant="outline" className="text-xs">
                            {issue.category}
                          </Badge>
                          <Badge variant="outline" className="text-xs font-mono">
                            &lt;{issue.element}&gt;
                          </Badge>
                        </div>
                        <div className="flex items-start gap-2 mt-2">
                          <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                          <p className="text-sm text-muted-foreground">{issue.suggestion}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredIssues?.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No issues found for this filter.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {activeWorkspace && (
        <BulkSiteAnalyzer
          workspaceId={activeWorkspace.id}
          analysisType="html-audit"
          onSelectResult={(res, pageUrl) => {
            setResult(res as unknown as AuditResult);
            setUrl(pageUrl);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
