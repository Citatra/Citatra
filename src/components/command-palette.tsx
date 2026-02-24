"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  BarChart3,
  Globe,
  Swords,
  Lightbulb,
  FlaskConical,
  Network,
  TrendingUp,
  Code2,
  FileCode,
  Compass,
  Link2,
  Layers,
  Target,
  PieChart,
  History,
  MousePointer,
  Plug,
  MapPin,
  Users,
  Settings,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface CommandItem {
  title: string;
  href: string;
  icon: React.ElementType;
  group: string;
  keywords?: string[];
}

const allCommands: CommandItem[] = [
  // Core
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Navigation" },
  { title: "Queries", href: "/dashboard/queries", icon: Search, group: "Navigation", keywords: ["keywords", "search"] },
  { title: "Sources", href: "/dashboard/sources", icon: Globe, group: "Navigation" },
  { title: "Competitors", href: "/dashboard/competitors", icon: Swords, group: "Navigation" },
  { title: "Prompts", href: "/dashboard/prompts", icon: FlaskConical, group: "Core", keywords: ["test", "ai", "prompt", "manage"] },
  { title: "Settings", href: "/dashboard/settings", icon: Settings, group: "Management" },
  // Advanced Analytics
  { title: "Analytics", href: "/dashboard/analytics", icon: BarChart3, group: "Advanced Analytics" },
  { title: "Traffic Attribution", href: "/dashboard/traffic-attribution", icon: MousePointer, group: "Advanced Analytics", keywords: ["ga4", "google analytics"] },
  { title: "SoV & Sentiment", href: "/dashboard/sov-sentiment", icon: PieChart, group: "Advanced Analytics", keywords: ["share of voice"] },
  { title: "Competitive Gap", href: "/dashboard/competitive-gap", icon: Target, group: "Advanced Analytics" },
  { title: "Backlinks", href: "/dashboard/backlinks", icon: Link2, group: "Advanced Analytics", keywords: ["referring domains"] },
  { title: "History Tracker", href: "/dashboard/historical-performance", icon: History, group: "Advanced Analytics" },
  { title: "SERP + AI Dashboard", href: "/dashboard/serp-ai-dashboard", icon: Layers, group: "Advanced Analytics", keywords: ["combined"] },
  // Technical Analysis
  { title: "Semantic Map", href: "/dashboard/semantic-map", icon: Network, group: "Technical Analysis", keywords: ["entities", "topics"] },
  { title: "Schema Generator", href: "/dashboard/schema-generator", icon: Code2, group: "Technical Analysis", keywords: ["json-ld", "structured data"] },
  { title: "HTML Audit", href: "/dashboard/html-audit", icon: FileCode, group: "Technical Analysis", keywords: ["seo", "semantic html"] },
  { title: "Geo Audit", href: "/dashboard/geo-audit", icon: MapPin, group: "Technical Analysis", keywords: ["geo", "hreflang", "localization"] },
  // Tools & Management
  { title: "Forecasting", href: "/dashboard/forecast", icon: TrendingUp, group: "Tools", keywords: ["predict", "trend"] },
  { title: "Keyword Explorer", href: "/dashboard/keyword-explorer", icon: Compass, group: "Tools", keywords: ["opportunity", "gap"] },
  { title: "Recommendations", href: "/dashboard/recommendations", icon: Lightbulb, group: "Tools" },
  { title: "CMS Connectors", href: "/dashboard/cms-connectors", icon: Plug, group: "Management", keywords: ["wordpress", "webflow", "shopify"] },
  { title: "Team", href: "/dashboard/team", icon: Users, group: "Management" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  // Ctrl+K / Cmd+K to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelectedIndex(0);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(q) ||
        cmd.group.toLowerCase().includes(q) ||
        cmd.keywords?.some((k) => k.includes(q))
    );
  }, [query]);

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.group]) groups[cmd.group] = [];
      groups[cmd.group].push(cmd);
    }
    return groups;
  }, [filtered]);

  const flatFiltered = useMemo(() => filtered, [filtered]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, flatFiltered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatFiltered[selectedIndex]) {
        navigate(flatFiltered[selectedIndex].href);
      }
    }
  };

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  let flatIndex = -1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Search pages... (Ctrl+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No results found.</p>
          ) : (
            Object.entries(grouped).map(([group, items]) => (
              <div key={group} className="mb-2">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</p>
                {items.map((cmd) => {
                  flatIndex++;
                  const idx = flatIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.href}
                      onClick={() => navigate(cmd.href)}
                      className={`w-full flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors ${
                        idx === selectedIndex
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{cmd.title}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground flex items-center gap-4">
          <span>
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">↑↓</kbd> Navigate
          </span>
          <span>
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">↵</kbd> Open
          </span>
          <span>
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd> Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
