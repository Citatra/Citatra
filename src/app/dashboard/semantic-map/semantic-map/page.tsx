"use client";

import { useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { BulkSiteAnalyzer } from "@/components/bulk-site-analyzer";

interface Entity {
  name: string;
  type: string;
  salience: number;
  mentions: number;
}
interface TopicCluster {
  topic: string;
  entities: Entity[];
  coverage: "strong" | "moderate" | "weak" | "missing";
  suggestion: string;
}
interface SemanticMapResponse {
  url: string | null;
  pageTitle: string;
  contentLength: number;
  entities: Entity[];
  topics: TopicCluster[];
  relationships: { source: string; target: string; strength: number }[];
  suggestions: string[];
  summary: {
    totalEntities: number;
    topicsCovered: number;
    topicsMissing: number;
    suggestionsCount: number;
  };
}

export default function SemanticMapPage() {
  const { activeWorkspace } = useWorkspace();
  const [url, setUrl] = useState("");
  const [keywords, setKeywords] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SemanticMapResponse | null>(null);

  const handleAnalyze = async () => {
    if (!activeWorkspace || !url.trim()) return;
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/semantic-map`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: url.trim(),
            targetKeywords: keywords
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
          }),
        }
      );
      if (!res.ok) throw new Error("Failed");
      setData(await res.json());
    } catch {
      toast.error("Failed to analyze content");
    } finally {
      setLoading(false);
    }
  };

  const coverageColor = (c: string) => {
    switch (c) {
      case "strong": return "bg-green-600";
      case "moderate": return "bg-yellow-500";
      case "weak": return "bg-orange-500";
      case "missing": return "bg-red-500";
      default: return "";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Semantic Topic & Entity Map"
        description="Analyze page content to extract entities, map topics, and get optimization suggestions"
        helpText="Provide a URL or paste content to extract named entities, topic clusters, and get suggestions for improving topical coverage."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analyze a Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="https://example.com/page"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Textarea
            placeholder="Target keywords (comma-separated, optional)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            rows={2}
          />
          <Button onClick={handleAnalyze} disabled={loading || !url.trim()}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Analyze
          </Button>
        </CardContent>
      </Card>

      {data && (
        <>
          {/* Summary */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Entities Found</CardDescription>
                <CardTitle className="text-2xl">{data.summary.totalEntities}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Topics Covered</CardDescription>
                <CardTitle className="text-2xl">{data.summary.topicsCovered}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Topics Missing</CardDescription>
                <CardTitle className="text-2xl text-white">{data.summary.topicsMissing}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Suggestions</CardDescription>
                <CardTitle className="text-2xl">{data.summary.suggestionsCount}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Suggestions */}
          {data.suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Optimization Suggestions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.suggestions.map((s, i) => (
                  <div key={i} className="text-sm p-3 bg-muted/30 rounded-md">
                    {s}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Topic Clusters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Topic Clusters</CardTitle>
              <CardDescription>Coverage analysis by topic area</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.topics.map((t, i) => (
                  <div key={i} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={coverageColor(t.coverage)}>{t.coverage}</Badge>
                      <span className="font-medium">{t.topic}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{t.suggestion}</p>
                    {t.entities.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {t.entities.map((e) => (
                          <Badge key={e.name} variant="outline" className="text-xs">
                            {e.name} ({e.mentions})
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Entities Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extracted Entities</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Mentions</TableHead>
                    <TableHead className="text-right">Salience</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.entities.slice(0, 25).map((e) => (
                    <TableRow key={e.name}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{e.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{e.mentions}</TableCell>
                      <TableCell className="text-right">{e.salience}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Entity Relationships */}
          {data.relationships.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Entity Relationships</CardTitle>
                <CardDescription>
                  Co-occurring entities (proximity-based)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {data.relationships.slice(0, 15).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm py-1">
                      <Badge variant="outline">{r.source}</Badge>
                      <span className="text-muted-foreground">↔</span>
                      <Badge variant="outline">{r.target}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        strength: {r.strength}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {activeWorkspace && (
        <BulkSiteAnalyzer
          workspaceId={activeWorkspace.id}
          analysisType="semantic-map"
          onSelectResult={(res, pageUrl) => {
            setData(res as unknown as SemanticMapResponse);
            setUrl(pageUrl);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
