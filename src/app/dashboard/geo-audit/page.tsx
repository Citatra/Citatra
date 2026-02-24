"use client";

import { useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle,
  Globe,
  Info,
  Loader2,
  MapPin,
  Server,
  XCircle,
  Languages,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { BulkSiteAnalyzer } from "@/components/bulk-site-analyzer";

// ── Types ──────────────────────────────────────────────────────────────

interface HreflangTag {
  lang: string;
  href: string;
}

interface SchemaBlock {
  type: string;
  hasAddress: boolean;
  hasGeo: boolean;
  hasPhone: boolean;
  hasOpeningHours: boolean;
}

interface GeoIssue {
  id: string;
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
  suggestion: string;
}

interface RegionSerpResult {
  region: string;
  language: string;
  hasAiOverview: boolean;
  overviewLength: number;
  sourceCount: number;
  brandCited: boolean;
  competitorsCited: string[];
  topSources: { domain: string; url: string }[];
}

interface GeoAuditResult {
  url: string;
  score: number;
  server: {
    ip: string;
    hostname: string;
    geo: {
      country: string;
      region: string;
      city: string;
      lat: number;
      lon: number;
      org: string;
    } | null;
  };
  htmlLang: string | null;
  hreflangs: HreflangTag[];
  localSchemas: SchemaBlock[];
  ogLocale: string | null;
  serpResults: RegionSerpResult[];
  issues: GeoIssue[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    hreflangCount: number;
    localSchemaCount: number;
    regionsChecked: number;
  };
}

// ── Constants ──────────────────────────────────────────────────────────

const REGION_OPTIONS = [
  { value: "us", label: "United States" },
  { value: "gb", label: "United Kingdom" },
  { value: "de", label: "Germany" },
  { value: "fr", label: "France" },
  { value: "es", label: "Spain" },
  { value: "it", label: "Italy" },
  { value: "nl", label: "Netherlands" },
  { value: "ca", label: "Canada" },
  { value: "au", label: "Australia" },
  { value: "br", label: "Brazil" },
  { value: "jp", label: "Japan" },
  { value: "kr", label: "South Korea" },
  { value: "in", label: "India" },
  { value: "mx", label: "Mexico" },
  { value: "za", label: "South Africa" },
];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  hreflang: <Languages className="h-4 w-4" />,
  schema: <ShieldCheck className="h-4 w-4" />,
  server: <Server className="h-4 w-4" />,
  meta: <Globe className="h-4 w-4" />,
  serp: <Search className="h-4 w-4" />,
};

// ── Component ──────────────────────────────────────────────────────────

export default function GeoAuditPage() {
  const { activeWorkspace } = useWorkspace();
  const [url, setUrl] = useState("");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([
    "us",
    "gb",
    "de",
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeoAuditResult | null>(null);
  const [issueFilter, setIssueFilter] = useState<
    "all" | "error" | "warning" | "info"
  >("all");

  const toggleRegion = (region: string) => {
    setSelectedRegions((prev) =>
      prev.includes(region)
        ? prev.filter((r) => r !== region)
        : prev.length < 5
          ? [...prev, region]
          : prev
    );
  };

  const runAudit = async () => {
    if (!activeWorkspace || !url) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/geo-audit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, regions: selectedRegions }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Audit failed");
      }
      setResult(await res.json());
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to run Geo Audit"
      );
    } finally {
      setLoading(false);
    }
  };

  const sevIcon = (s: string) => {
    switch (s) {
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const filteredIssues = result?.issues.filter(
    (i) => issueFilter === "all" || i.severity === issueFilter
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="GEO Audit"
        description="Analyze your page's international SEO readiness — server geolocation, hreflang, local schema, and multi-region AI Overview citations."
        helpText="Enter a URL and select up to 5 regions. The tool checks server IP location, hreflang tags, LocalBusiness schema, and fetches localized AI Overviews to compare citation coverage across regions."
      />

      {/* ── Input Card ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run GEO Audit</CardTitle>
          <CardDescription>
            Enter a URL and select regions to compare
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="https://example.com/page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={runAudit}
              disabled={loading || !url || selectedRegions.length === 0}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Globe className="h-4 w-4 mr-2" />
              )}
              {loading ? "Auditing…" : "Run Audit"}
            </Button>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Regions to check (max 5):
            </p>
            <div className="flex flex-wrap gap-2">
              {REGION_OPTIONS.map((r) => (
                <Badge
                  key={r.value}
                  variant={
                    selectedRegions.includes(r.value) ? "default" : "outline"
                  }
                  className="cursor-pointer select-none"
                  onClick={() => toggleRegion(r.value)}
                >
                  {r.value.toUpperCase()} — {r.label}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Results ────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <p className="text-3xl font-bold text-foreground">
                  {result.score}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  GEO Score
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <p className="text-3xl font-bold text-foreground">
                  {result.summary.errors}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Errors</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <p className="text-3xl font-bold text-foreground">
                  {result.summary.warnings}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Warnings</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <p className="text-3xl font-bold text-foreground">
                  {result.summary.infos}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Info</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <p className="text-3xl font-bold text-foreground">
                  {result.summary.hreflangCount}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Hreflang</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="h-full flex flex-col items-center justify-center text-center">
                <p className="text-3xl font-bold text-foreground">
                  {result.summary.regionsChecked}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Regions
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Server + Meta info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Server card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="h-4 w-4" /> Server Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hostname</span>
                  <span className="font-mono">{result.server.hostname}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IP Address</span>
                  <span className="font-mono">
                    {result.server.ip || "—"}
                  </span>
                </div>
                {result.server.geo && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Location</span>
                      <span>
                        {result.server.geo.city},{" "}
                        {result.server.geo.region},{" "}
                        {result.server.geo.country}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Coordinates</span>
                      <span className="font-mono text-xs">
                        {result.server.geo.lat.toFixed(4)},{" "}
                        {result.server.geo.lon.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Hosting Org</span>
                      <span className="text-xs max-w-[200px] truncate text-right">
                        {result.server.geo.org}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Locale signals card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Languages className="h-4 w-4" /> Locale Signals
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HTML lang</span>
                  <span>
                    {result.htmlLang ? (
                      <Badge variant="outline">{result.htmlLang}</Badge>
                    ) : (
                      <Badge variant="destructive">Missing</Badge>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">og:locale</span>
                  <span>
                    {result.ogLocale ? (
                      <Badge variant="outline">{result.ogLocale}</Badge>
                    ) : (
                      <Badge variant="secondary">Not set</Badge>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hreflang tags</span>
                  <span className="font-mono">
                    {result.hreflangs.length}
                  </span>
                </div>
                {result.hreflangs.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {result.hreflangs.map((h) => (
                      <Badge
                        key={h.lang}
                        variant="outline"
                        className="text-[10px]"
                      >
                        {h.lang}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground">
                    Local schemas
                  </span>
                  <span>
                    {result.localSchemas.length > 0 ? (
                      result.localSchemas.map((s, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="ml-1 text-[10px]"
                        >
                          {s.type}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="secondary">None</Badge>
                    )}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SERP comparison table */}
          {result.serpResults.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Multi-Region AI Overview
                  Comparison
                </CardTitle>
                <CardDescription>
                  How the same query appears across regions
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Region</TableHead>
                      <TableHead>AI Overview</TableHead>
                      <TableHead className="text-right">Sources</TableHead>
                      <TableHead>Brand Cited</TableHead>
                      <TableHead>Competitors Cited</TableHead>
                      <TableHead>Top Sources</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.serpResults.map((sr) => (
                      <TableRow key={sr.region}>
                        <TableCell>
                          <Badge variant="outline">
                            {sr.region.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({sr.language})
                          </span>
                        </TableCell>
                        <TableCell>
                          {sr.hasAiOverview ? (
                            <span className="flex items-center gap-1 text-green-600 text-sm">
                              <CheckCircle className="h-3 w-3" /> Yes
                              <span className="text-xs text-muted-foreground ml-1">
                                ({sr.overviewLength} chars)
                              </span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted-foreground text-sm">
                              <XCircle className="h-3 w-3" /> No
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {sr.sourceCount}
                        </TableCell>
                        <TableCell>
                          {sr.brandCited ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              Yes
                            </Badge>
                          ) : sr.hasAiOverview ? (
                            <Badge variant="destructive">No</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              N/A
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {sr.competitorsCited.length > 0
                              ? sr.competitorsCited.map((c) => (
                                  <Badge
                                    key={c}
                                    variant="outline"
                                    className="text-[10px]"
                                  >
                                    {c}
                                  </Badge>
                                ))
                              : sr.hasAiOverview && (
                                  <span className="text-xs text-muted-foreground">
                                    None
                                  </span>
                                )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {sr.topSources.slice(0, 3).map((s, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {s.domain}
                              </Badge>
                            ))}
                            {sr.topSources.length > 3 && (
                              <Badge
                                variant="secondary"
                                className="text-[10px]"
                              >
                                +{sr.topSources.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Issues list */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Issues ({filteredIssues?.length || 0})
                </CardTitle>
                <div className="flex gap-2">
                  {(["all", "error", "warning", "info"] as const).map((f) => (
                    <Button
                      key={f}
                      variant={issueFilter === f ? "default" : "outline"}
                      size="sm"
                      onClick={() => setIssueFilter(f)}
                    >
                      {f === "all"
                        ? "All"
                        : f.charAt(0).toUpperCase() + f.slice(1)}
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
                      {sevIcon(issue.severity)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {issue.message}
                          </span>
                          <Badge variant="outline" className="text-[10px]">
                            {CATEGORY_ICONS[issue.category] || null}{" "}
                            {issue.category}
                          </Badge>
                        </div>
                        <div className="flex items-start gap-2 mt-1">
                          <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                          <p className="text-sm text-muted-foreground">
                            {issue.suggestion}
                          </p>
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
          analysisType="geo-audit"
          onSelectResult={(res, pageUrl) => {
            setResult(res as unknown as GeoAuditResult);
            setUrl(pageUrl);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
