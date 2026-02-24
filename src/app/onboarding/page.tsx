"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import {
  Globe,
  Search,
  Swords,
  CheckCircle2,
  Circle,
  Rocket,
  HelpCircle,
  X,
  Plus,
  ArrowRight,
  Loader2,
  Sparkles,
  BarChart3,
  Eye,
  ScanSearch,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TOTAL_STEPS = 4;

const stepMeta = [
  {
    number: 1,
    label: "Workspace",
    icon: Globe,
    description: "Name & settings",
  },
  {
    number: 2,
    label: "Keywords",
    icon: Search,
    description: "What to track",
  },
  {
    number: 3,
    label: "Competitors",
    icon: Swords,
    description: "Who to watch",
  },
  {
    number: 4,
    label: "Launch",
    icon: Rocket,
    description: "Start tracking",
  },
];

const REGION_OPTIONS = [
  { value: "us", label: "United States" },
  { value: "gb", label: "United Kingdom" },
  { value: "ca", label: "Canada" },
  { value: "au", label: "Australia" },
  { value: "de", label: "Germany" },
  { value: "fr", label: "France" },
  { value: "es", label: "Spain" },
  { value: "it", label: "Italy" },
  { value: "nl", label: "Netherlands" },
  { value: "br", label: "Brazil" },
  { value: "in", label: "India" },
  { value: "jp", label: "Japan" },
  { value: "mx", label: "Mexico" },
  { value: "se", label: "Sweden" },
  { value: "sg", label: "Singapore" },
];

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily", description: "Checked once every day" },
  { value: "twice_daily", label: "Twice daily", description: "Checked every 12 hours" },
  { value: "weekly", label: "Weekly", description: "Checked once a week" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState(1);
  const [workspaceName, setWorkspaceName] = useState("");
  const [domain, setDomain] = useState("");
  const [brandNamesText, setBrandNamesText] = useState("");
  const [region, setRegion] = useState("us");
  const [frequency, setFrequency] = useState("daily");
  const [keywords, setKeywords] = useState<{ text: string; volume: number }[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [competitorInput, setCompetitorInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [completionData, setCompletionData] = useState<{
    queriesCreated: number;
    competitorsCreated: number;
    totalActiveQueries: number;
  } | null>(null);
  const [fetchProgress, setFetchProgress] = useState<{
    fetched: number;
    total: number;
    promptsComplete: boolean;
    analysisCompleted: number;
    analysisTotal: number;
    analysisComplete: boolean;
    complete: boolean;
  } | null>(null);


  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        if (data.workspaces.length > 0) {
          const ws = data.workspaces[0];
          setWorkspaceId(ws.id);
          if (ws.onboardingCompleted) {
            router.push("/dashboard");
          }
          // Pre-fill fields if already set
          if (ws.name) setWorkspaceName(ws.name);
          if (ws.domain) setDomain(ws.domain);
          if (ws.region) setRegion(ws.region);
          if (ws.updateFrequency) setFrequency(ws.updateFrequency);
        }
      }
    } catch (error) {
      console.error("Error fetching workspace:", error);
    }
  }, [router]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  // --- Poll for fetch progress once on step 4 ---
  useEffect(() => {
    if (step !== 4 || !workspaceId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/onboarding`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setFetchProgress({
          fetched: data.fetchedQueries,
          total: data.totalQueries,
          promptsComplete: data.promptsComplete,
          analysisCompleted: data.completedAnalyses,
          analysisTotal: data.totalAnalyses,
          analysisComplete: data.analysisComplete,
          complete: data.complete,
        });
        if (!data.complete && !cancelled) {
          setTimeout(poll, 3000);
        }
      } catch {
        // retry on error
        if (!cancelled) setTimeout(poll, 5000);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [step, workspaceId]);

  // --- Auto-redirect when all fetches complete ---
  useEffect(() => {
    if (fetchProgress?.complete) {
      const timeout = setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [fetchProgress?.complete, router]);

  // --- Keyword helpers ---
  const keywordTexts = keywords.map((k) => k.text);

  const addKeyword = (kw: string, volume: number = 3) => {
    const trimmed = kw.trim();
    if (trimmed && !keywordTexts.includes(trimmed) && keywords.length < 100) {
      setKeywords((prev) => [...prev, { text: trimmed, volume }]);
    }
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(keywordInput);
      setKeywordInput("");
    }
  };

  const handleKeywordPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const items = pasted.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const unique = items.filter((kw) => !keywordTexts.includes(kw));
    setKeywords((prev) => [...prev, ...unique.map((t) => ({ text: t, volume: 3 }))].slice(0, 100));
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k.text !== kw));
  };

  // --- Competitor helpers ---
  const addCompetitor = (d: string) => {
    const trimmed = d.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "");
    if (trimmed && !competitors.includes(trimmed) && competitors.length < 20) {
      setCompetitors((prev) => [...prev, trimmed]);
    }
  };

  const handleCompetitorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCompetitor(competitorInput);
      setCompetitorInput("");
    }
  };

  const handleCompetitorPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const items = pasted.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    items.forEach(addCompetitor);
    setCompetitorInput("");
  };

  const removeCompetitor = (comp: string) => {
    setCompetitors((prev) => prev.filter((c) => c !== comp));
  };



  // --- Domain validation ---
  const cleanDomain = (raw: string) =>
    raw.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "");

  const isValidDomain = (d: string) =>
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/.test(d);



  // --- Completion ---
  const handleComplete = async () => {
    if (!workspaceId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceName: workspaceName.trim() || undefined,
          domain: cleanDomain(domain) || undefined,
          brandNames: brandNamesText.split(",").map((b) => b.trim()).filter(Boolean),
          region,
          frequency,
          keywords: keywords.length > 0 ? keywords : undefined,
          competitors: competitors.length > 0 ? competitors : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCompletionData(data);
        setStep(4);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to complete setup");
      }
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const goToDashboard = () => {
    router.push("/dashboard");
    router.refresh();
  };

  const progress = step === 4 ? 100 : ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  return (
    <TooltipProvider>
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-lg space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              Welcome to Citatra{session?.user?.name ? `, ${session.user.name}` : ""}!
            </h1>
            <p className="text-muted-foreground">
              Let&apos;s set up your AI Overview monitoring in a few quick steps
            </p>
          </div>

          {/* Step progress indicator */}
          <div className="space-y-3">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between">
              {stepMeta.map((s) => {
                const Icon = s.icon;
                const isComplete = step > s.number;
                const isCurrent = step === s.number;
                return (
                  <button
                    key={s.number}
                    onClick={() => {
                      if (s.number < step && step !== 4) setStep(s.number);
                    }}
                    className={`flex items-center gap-1.5 text-xs transition-colors ${
                      isCurrent
                        ? "text-primary font-medium"
                        : isComplete
                        ? "text-primary/70 cursor-pointer hover:text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : isCurrent ? (
                      <Icon className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Step 1: Workspace Setup ───────────────────────────── */}
          {step === 1 && (
            <Card className="animate-in fade-in-50 slide-in-from-right-5 duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  Workspace Setup
                </CardTitle>
                <CardDescription>
                  Name your workspace and configure your monitoring preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Workspace name */}
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">Workspace Name</Label>
                  <Input
                    id="workspace-name"
                    placeholder="My Company"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    className="text-base"
                  />
                  <p className="text-xs text-muted-foreground">
                    A friendly name for your workspace — you can change it later
                  </p>
                </div>

                {/* Domain */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="domain">Domain</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[220px]">
                        <p className="text-xs">Enter your website&apos;s root domain without http:// or www.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="domain"
                    placeholder="example.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="text-base"
                  />
                  {domain && !isValidDomain(cleanDomain(domain)) && cleanDomain(domain).length > 2 && (
                    <p className="text-xs text-destructive">
                      Doesn&apos;t look like a valid domain — make sure it&apos;s formatted like &quot;example.com&quot;
                    </p>
                  )}
                </div>

                {/* Brand Names */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="brand-names">Brand Name &amp; Aliases</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[240px]">
                        <p className="text-xs">Enter your brand name and any alternative names, separated by commas. Used to detect mentions in AI responses.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="brand-names"
                    placeholder="Acme, Acme Corp, ACME Inc"
                    value={brandNamesText}
                    onChange={(e) => setBrandNamesText(e.target.value)}
                    className="text-base"
                  />
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll check if any of these names appear in AI-generated responses
                  </p>
                </div>

                {/* Region & Frequency row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Search Region</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[220px]">
                          <p className="text-xs">The country where AI Overview queries will be executed from.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REGION_OPTIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Update Frequency</Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[220px]">
                          <p className="text-xs">How often we check your keywords against Google AI Overview.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Select value={frequency} onValueChange={setFrequency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="justify-between">
                <Button variant="ghost" onClick={() => { handleComplete(); }}>
                  Skip setup
                </Button>
                <Button onClick={() => setStep(2)}>
                  Next
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* ── Step 2: Keywords ───────────────────────────────────── */}
          {step === 2 && (
            <Card className="animate-in fade-in-50 slide-in-from-right-5 duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-primary" />
                  Keywords to Track
                </CardTitle>
                <CardDescription>
                  Add the search queries you want to monitor in Google AI Overviews
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="keywords">Add keywords</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[260px]">
                        <p className="text-xs">Type a keyword and press Enter. You can also paste a comma-separated list. These will be tracked in Google AI Overviews daily.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="keywords"
                      placeholder="Type a keyword and press Enter…"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={handleKeywordKeyDown}
                      onPaste={handleKeywordPaste}
                      className="text-base"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        addKeyword(keywordInput);
                        setKeywordInput("");
                      }}
                      disabled={!keywordInput.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Keyword tags */}
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                    {keywords.map((kw) => (
                      <Badge key={kw.text} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1">
                        {kw.text}
                        {kw.volume > 0 && (
                          <span className="text-[10px] text-muted-foreground ml-0.5">({kw.volume})</span>
                        )}
                        <button
                          onClick={() => removeKeyword(kw.text)}
                          className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}



                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    {keywords.length} keyword{keywords.length !== 1 ? "s" : ""} added · Each will be tracked daily as an active prompt
                  </p>
                </div>
              </CardContent>
              <CardFooter className="justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)}>
                  Next
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* ── Step 3: Competitors ────────────────────────────────── */}
          {step === 3 && (
            <Card className="animate-in fade-in-50 slide-in-from-right-5 duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Swords className="h-5 w-5 text-primary" />
                  Competitors to Watch
                </CardTitle>
                <CardDescription>
                  Add competitor domains to compare their AI Overview visibility against yours
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="competitors">Competitor domains</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[240px]">
                        <p className="text-xs">Add domains of sites that compete with you. We&apos;ll track how often they appear in AI Overviews for your keywords.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="competitors"
                      placeholder="competitor.com"
                      value={competitorInput}
                      onChange={(e) => setCompetitorInput(e.target.value)}
                      onKeyDown={handleCompetitorKeyDown}
                      onPaste={handleCompetitorPaste}
                      className="text-base"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        addCompetitor(competitorInput);
                        setCompetitorInput("");
                      }}
                      disabled={!competitorInput.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Competitor tags */}
                {competitors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {competitors.map((comp) => (
                      <Badge key={comp} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1">
                        {comp}
                        <button
                          onClick={() => removeCompetitor(comp)}
                          className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}



                {/* Setup summary */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <p className="text-sm font-medium">Setup Summary</p>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {workspaceName ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>Workspace: <strong className="text-foreground">{workspaceName || "Default"}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      {domain ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>Domain: <strong className="text-foreground">{cleanDomain(domain) || "Not set"}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span>Region: <strong className="text-foreground">{REGION_OPTIONS.find((r) => r.value === region)?.label || region}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      <span>Frequency: <strong className="text-foreground">{FREQUENCY_OPTIONS.find((f) => f.value === frequency)?.label || frequency}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      {keywords.length > 0 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>
                        Keywords: <strong className="text-foreground">{keywords.length}</strong> to track
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {competitors.length > 0 ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>
                        Competitors: <strong className="text-foreground">{competitors.length}</strong> to watch
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button onClick={handleComplete} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up…
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* ── Step 4: Completion ─────────────────────────────────── */}
          {step === 4 && !saving && (
            <Card className="animate-in fade-in-50 zoom-in-95 duration-500">
              <CardContent className="pt-8 pb-8 text-center space-y-6">
                {/* Icon changes based on overall status */}
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mx-auto ${
                  fetchProgress?.complete ? "bg-emerald-500/10" : "bg-primary/10"
                }`}>
                  {fetchProgress?.complete ? (
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  ) : (
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  )}
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {fetchProgress?.complete
                      ? "You\u2019re all set!"
                      : fetchProgress?.promptsComplete
                        ? "Analyzing your site\u2026"
                        : "Running your first prompts\u2026"}
                  </h2>
                  <p className="text-muted-foreground">
                    {fetchProgress?.complete
                      ? "Your dashboard is ready. Redirecting\u2026"
                      : fetchProgress?.promptsComplete
                        ? "Running HTML audit, schema, semantic, and geo analysis on your pages."
                        : "We\u2019re checking Google AI Overview for your keywords. This usually takes a minute or two."}
                  </p>
                </div>

                {/* Phase 1: Prompt progress */}
                {fetchProgress && fetchProgress.total > 0 && (
                  <div className="max-w-xs mx-auto space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {fetchProgress.promptsComplete ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Search className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                      <span className="flex-1 text-left">Prompt checks</span>
                      <span>{fetchProgress.fetched}/{fetchProgress.total}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                          fetchProgress.promptsComplete ? "bg-emerald-500" : "bg-primary"
                        }`}
                        style={{
                          width: `${Math.round((fetchProgress.fetched / fetchProgress.total) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Phase 2: Site analysis progress */}
                {fetchProgress?.promptsComplete && (
                  <div className="max-w-xs mx-auto space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {fetchProgress.analysisComplete ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <ScanSearch className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                      <span className="flex-1 text-left">Site analysis (15 pages &times; 4 tools)</span>
                      <span>
                        {fetchProgress.analysisTotal > 0
                          ? `${fetchProgress.analysisCompleted}/${fetchProgress.analysisTotal}`
                          : "Starting\u2026"}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                          fetchProgress.analysisComplete ? "bg-emerald-500" : "bg-primary"
                        }`}
                        style={{
                          width: fetchProgress.analysisTotal > 0
                            ? `${Math.round((fetchProgress.analysisCompleted / fetchProgress.analysisTotal) * 100)}%`
                            : "5%",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* What was created */}
                {completionData && (
                  <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                      <Eye className="h-4 w-4 text-primary mx-auto" />
                      <p className="text-lg font-bold">{completionData.queriesCreated}</p>
                      <p className="text-[10px] text-muted-foreground">Prompts created</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                      <Swords className="h-4 w-4 text-primary mx-auto" />
                      <p className="text-lg font-bold">{completionData.competitorsCreated}</p>
                      <p className="text-[10px] text-muted-foreground">Competitors added</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                      <BarChart3 className="h-4 w-4 text-primary mx-auto" />
                      <p className="text-lg font-bold">{FREQUENCY_OPTIONS.find((f) => f.value === frequency)?.label || "Daily"}</p>
                      <p className="text-[10px] text-muted-foreground">Tracking frequency</p>
                    </div>
                  </div>
                )}

                {/* What happens next - shown while working */}
                {!fetchProgress?.complete && (
                  <div className="rounded-lg border bg-muted/20 p-4 text-left space-y-3 max-w-sm mx-auto">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">What&apos;s happening</p>
                    <div className="space-y-2">
                      {[
                        { icon: Sparkles, text: "Checking your prompts against Google AI Overview", done: !!fetchProgress?.promptsComplete },
                        { icon: Eye, text: "Detecting brand mentions and competitor citations", done: !!fetchProgress?.promptsComplete },
                        { icon: ScanSearch, text: "Running HTML audit on 15 pages", done: !!fetchProgress?.analysisComplete },
                        { icon: ScanSearch, text: "Generating schema markup suggestions", done: !!fetchProgress?.analysisComplete },
                        { icon: ScanSearch, text: "Building semantic content maps", done: !!fetchProgress?.analysisComplete },
                        { icon: Globe, text: "Running geo-location audit", done: !!fetchProgress?.analysisComplete },
                      ].map((item) => (
                        <div key={item.text} className="flex items-start gap-2 text-xs text-muted-foreground">
                          {item.done ? (
                            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />
                          ) : (
                            <item.icon className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                          )}
                          <span className={item.done ? "line-through opacity-50" : ""}>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  size="lg"
                  onClick={goToDashboard}
                  className="px-8"
                  disabled={!fetchProgress?.complete}
                >
                  {fetchProgress?.complete ? (
                    <>
                      Go to Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {fetchProgress?.promptsComplete ? "Analyzing site\u2026" : "Fetching results\u2026"}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
