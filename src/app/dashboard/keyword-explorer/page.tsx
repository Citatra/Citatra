"use client";

import { useState, useEffect } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Target, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

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

export default function KeywordExplorerPage() {
  const { activeWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [summary, setSummary] = useState<OpportunitySummary | null>(null);
  const [filter, setFilter] = useState<"all" | "gap" | "expansion" | "trending" | "long-tail">("all");

  const fetchData = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/keyword-explorer`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOpportunities(data.opportunities);
      setSummary(data.summary);
    } catch {
      toast.error("Failed to load keyword opportunities");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  const filtered = opportunities.filter((o) => filter === "all" || o.type === filter);

  const typeIcon = (type: string) => {
    switch (type) {
      case "gap": return <Target className="h-4 w-4 text-red-500" />;
      case "expansion": return <Sparkles className="h-4 w-4 text-purple-500" />;
      case "trending": return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "long-tail": return <Search className="h-4 w-4 text-blue-500" />;
      default: return null;
    }
  };

  const impactBadge = (impact: string) => {
    const variant = impact === "high" ? "destructive" : impact === "medium" ? "secondary" : "outline";
    return <Badge variant={variant}>{impact}</Badge>;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Keyword & Semantic Opportunity Explorer"
        description="Discover keyword gaps, semantic expansions, and content opportunities from AI overview analysis."
        helpText="Identifies keywords where competitors appear in AI Overviews but you don't, plus semantic expansion opportunities from entity analysis."
        actions={
          <Button onClick={fetchData} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Refresh
          </Button>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{summary.totalOpportunities}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-red-600">{summary.gaps}</p>
              <p className="text-xs text-muted-foreground">Gaps</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-purple-600">{summary.expansions}</p>
              <p className="text-xs text-muted-foreground">Expansions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-green-600">{summary.trending}</p>
              <p className="text-xs text-muted-foreground">Trending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-blue-600">{summary.longTail}</p>
              <p className="text-xs text-muted-foreground">Long-Tail</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold text-orange-600">{summary.highImpact}</p>
              <p className="text-xs text-muted-foreground">High Impact</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex gap-2">
        {(["all", "gap", "expansion", "trending", "long-tail"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "long-tail" ? "Long-Tail" : f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((opp, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  {typeIcon(opp.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{opp.keyword}</span>
                      <Badge variant="outline" className="text-xs capitalize">{opp.type}</Badge>
                      {impactBadge(opp.potentialImpact)}
                      {opp.currentVisibility > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Current: {opp.currentVisibility}%
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        Relevance: {opp.relevanceScore}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{opp.suggestion}</p>
                    <p className="text-xs text-muted-foreground mt-1">{opp.source}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && !loading && (
            <Card>
              <CardContent className="py-12 text-center">
                <CardDescription>No opportunities found. Track more queries to discover opportunities.</CardDescription>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
