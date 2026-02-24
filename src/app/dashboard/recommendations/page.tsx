"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Info,
  ExternalLink,
  RefreshCw,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

interface Recommendation {
  id: string;
  type: "opportunity" | "warning" | "improvement" | "info";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  queryText?: string;
  queryId?: string;
}

const typeConfig = {
  warning: {
    icon: AlertTriangle,
    color: "text-red-500",
    bg: "bg-red-50 dark:bg-red-950/20",
    badgeVariant: "destructive" as const,
  },
  opportunity: {
    icon: Lightbulb,
    color: "text-yellow-500",
    bg: "bg-yellow-50 dark:bg-yellow-950/20",
    badgeVariant: "default" as const,
  },
  improvement: {
    icon: TrendingUp,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    badgeVariant: "secondary" as const,
  },
  info: {
    icon: Info,
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    badgeVariant: "outline" as const,
  },
};

export default function RecommendationsPage() {
  const { activeWorkspace } = useWorkspace();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecommendations = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/recommendations`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRecommendations(data.recommendations || []);
    } catch {
      toast.error("Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  const highCount = recommendations.filter((r) => r.priority === "high").length;
  const medCount = recommendations.filter(
    (r) => r.priority === "medium"
  ).length;
  const lowCount = recommendations.filter((r) => r.priority === "low").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recommendations"
        description="Automated insights and action items to improve your AI Overview visibility"
        helpText="These recommendations are generated automatically based on your tracking data. Higher priority items have more impact on your visibility."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRecommendations}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        }
      />

      {/* Summary */}
      {!loading && recommendations.length > 0 && (
        <div className="flex gap-3">
          {highCount > 0 && (
            <Badge variant="destructive">
              {highCount} High Priority
            </Badge>
          )}
          {medCount > 0 && (
            <Badge variant="secondary">
              {medCount} Medium
            </Badge>
          )}
          {lowCount > 0 && (
            <Badge variant="outline">
              {lowCount} Low
            </Badge>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && recommendations.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No recommendations</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Everything looks great! Start tracking more queries to get
              personalized insights.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Recommendations list */}
      {!loading && recommendations.length > 0 && (
        <div className="space-y-3">
          {recommendations.map((rec) => {
            const config = typeConfig[rec.type] || typeConfig.info;
            const Icon = config.icon;
            return (
              <Card key={rec.id} className={config.bg}>
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">
                          {rec.title}
                        </CardTitle>
                        <Badge variant={config.badgeVariant} className="text-xs">
                          {rec.priority}
                        </Badge>
                      </div>
                      <CardDescription className="mt-1">
                        {rec.description}
                      </CardDescription>
                    </div>
                    {rec.queryId && (
                      <Link href={`/dashboard/queries/${rec.queryId}`}>
                        <Button variant="ghost" size="icon" className="shrink-0">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
