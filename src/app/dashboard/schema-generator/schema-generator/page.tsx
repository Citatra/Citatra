"use client";

import { useState } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Code, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { BulkSiteAnalyzer } from "@/components/bulk-site-analyzer";

interface SchemaResult {
  detectedType: string;
  schemas: { type: string; jsonLd: Record<string, unknown> }[];
  htmlSnippets: string[];
  validation: { type: string; valid: boolean; warnings: string[] }[];
}

export default function SchemaGeneratorPage() {
  const { activeWorkspace } = useWorkspace();
  const [url, setUrl] = useState("");
  const [contentType, setContentType] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SchemaResult | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!activeWorkspace || !url.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/schema-generator`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim(), contentType }),
        }
      );
      if (!res.ok) throw new Error("Failed");
      setResult(await res.json());
    } catch {
      toast.error("Failed to generate schema");
    } finally {
      setLoading(false);
    }
  };

  const copySnippet = (index: number) => {
    if (!result) return;
    navigator.clipboard.writeText(result.htmlSnippets[index]);
    setCopied(index);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schema Generator"
        description="Automatically generate JSON-LD structured data for FAQ, Article, Product, and HowTo pages"
        helpText="Enter a URL and the tool will analyze the page content to generate appropriate JSON-LD schema markup you can add to your site."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate Schema Markup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="https://example.com/your-page"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex gap-3 items-center">
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="faq">FAQ Page</SelectItem>
                <SelectItem value="article">Article</SelectItem>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="howto">HowTo Guide</SelectItem>
                <SelectItem value="localbusiness">Local Business</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleGenerate} disabled={loading || !url.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Code className="h-4 w-4 mr-2" />
              )}
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground">Detected type:</span>
            <Badge>{result.detectedType}</Badge>
            <span className="text-sm text-muted-foreground ml-2">
              {result.schemas.length} schema(s) generated
            </span>
          </div>

          {result.schemas.map((schema, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      {schema.type} Schema
                    </CardTitle>
                    <CardDescription>
                      {result.validation[i]?.valid ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-3 w-3" /> Valid structure
                        </span>
                      ) : (
                        <span className="text-red-500">Invalid structure</span>
                      )}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copySnippet(i)}
                  >
                    {copied === i ? (
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                    ) : (
                      <Copy className="h-4 w-4 mr-1" />
                    )}
                    {copied === i ? "Copied" : "Copy"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto max-h-80 w-full whitespace-pre-wrap break-words">
                  {result.htmlSnippets[i]}
                </pre>
                {result.validation[i]?.warnings.length > 0 && (
                  <div className="space-y-1">
                    {result.validation[i].warnings.map((w, wi) => (
                      <div
                        key={wi}
                        className="flex items-center gap-2 text-sm text-yellow-600"
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {activeWorkspace && (
        <BulkSiteAnalyzer
          workspaceId={activeWorkspace.id}
          analysisType="schema-generator"
          onSelectResult={(res, pageUrl) => {
            setResult(res as unknown as SchemaResult);
            setUrl(pageUrl);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </div>
  );
}
