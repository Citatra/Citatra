"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";

/**
 * Auto-generates breadcrumbs from the current pathname.
 * Maps /dashboard/traffic-attribution → Dashboard > Traffic Attribution
 */

const labelMap: Record<string, string> = {
  dashboard: "Dashboard",
  queries: "Queries",
  analytics: "Analytics",
  sources: "Sources",
  competitors: "Competitors",
  recommendations: "Recommendations",
  playground: "Prompts",
  "semantic-map": "Semantic Map",
  forecast: "Forecasting",
  "schema-generator": "Schema Generator",
  "html-audit": "HTML Audit",
  "keyword-explorer": "Keyword Explorer",
  backlinks: "Backlinks",
  "serp-ai-dashboard": "SERP + AI Dashboard",
  "competitive-gap": "Competitive Gap",
  "sov-sentiment": "SoV & Sentiment",
  "historical-performance": "History Tracker",
  "traffic-attribution": "Traffic Attribution",
  "cms-connectors": "CMS Connectors",
  "geo-audit": "Geo Audit",
  team: "Team",
  settings: "Settings",
  compare: "Compare",
  docs: "Documentation",
  features: "Features",
  "quick-start": "Quick Start",
  faq: "FAQ",
  shortcuts: "Keyboard Shortcuts",
};

function toLabel(segment: string): string {
  return (
    labelMap[segment] ||
    segment
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export function Breadcrumbs() {
  const pathname = usePathname();
  if (!pathname || pathname === "/dashboard") return null;

  const segments = pathname.split("/").filter(Boolean);
  // Remove "dashboard" prefix for display but keep for links
  const crumbs = segments.map((seg, i) => ({
    label: toLabel(seg),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  // Replace first segment with a Home icon
  if (crumbs.length > 0) {
    crumbs[0] = { ...crumbs[0], label: "" };
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
          {crumb.isLast ? (
            <span className="font-medium text-foreground truncate max-w-[200px]">
              {crumb.label || <Home className="h-3.5 w-3.5" />}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-foreground transition-colors truncate max-w-[150px]"
            >
              {crumb.label || <Home className="h-3.5 w-3.5" />}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
