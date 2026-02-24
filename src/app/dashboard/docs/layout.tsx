"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TableOfContents } from "@/components/docs/table-of-contents";
import {
  LayoutDashboard,
  Swords,
  FlaskConical,
  Globe,
  MousePointer,
  PieChart,
  Target,
  Link2,
  Network,
  Code2,
  FileCode,
  MapPin,
  Lightbulb,
  Plug,
  Users,
  Settings,
  BookOpen,
  Rocket,
  HelpCircle,
  Keyboard,
} from "lucide-react";

interface DocNavItem {
  title: string;
  href: string;
  icon: React.ElementType;
}

interface DocNavSection {
  label: string;
  items: DocNavItem[];
}

const docSections: DocNavSection[] = [
  {
    label: "Getting Started",
    items: [
      { title: "Overview", href: "/dashboard/docs", icon: BookOpen },
      { title: "Quick Start", href: "/dashboard/docs/quick-start", icon: Rocket },
      { title: "FAQ", href: "/dashboard/docs/faq", icon: HelpCircle },
      { title: "Keyboard Shortcuts", href: "/dashboard/docs/shortcuts", icon: Keyboard },
    ],
  },
  {
    label: "Core Features",
    items: [
      { title: "Dashboard", href: "/dashboard/docs/features/dashboard", icon: LayoutDashboard },
      { title: "Competitors", href: "/dashboard/docs/features/competitors", icon: Swords },
      { title: "Prompts", href: "/dashboard/docs/features/prompts", icon: FlaskConical },
      { title: "Sources", href: "/dashboard/docs/features/sources", icon: Globe },
    ],
  },
  {
    label: "Advanced Analytics",
    items: [
      { title: "Traffic Attribution", href: "/dashboard/docs/features/traffic-attribution", icon: MousePointer },
      { title: "SoV & Sentiment", href: "/dashboard/docs/features/sov-sentiment", icon: PieChart },
      { title: "Competitive Gap", href: "/dashboard/docs/features/competitive-gap", icon: Target },
      { title: "Backlinks", href: "/dashboard/docs/features/backlinks", icon: Link2 },
    ],
  },
  {
    label: "Technical Analysis",
    items: [
      { title: "Semantic Map", href: "/dashboard/docs/features/semantic-map", icon: Network },
      { title: "Schema Generator", href: "/dashboard/docs/features/schema-generator", icon: Code2 },
      { title: "HTML Audit", href: "/dashboard/docs/features/html-audit", icon: FileCode },
      { title: "GEO Audit", href: "/dashboard/docs/features/geo-audit", icon: MapPin },
    ],
  },
  {
    label: "Other",
    items: [
      { title: "Recommendations", href: "/dashboard/docs/features/recommendations", icon: Lightbulb },
      { title: "CMS Connectors", href: "/dashboard/docs/features/cms-connectors", icon: Plug },
      { title: "Team Management", href: "/dashboard/docs/features/team", icon: Users },
      { title: "Settings", href: "/dashboard/docs/features/settings", icon: Settings },
    ],
  },
];

function DocsSideNav() {
  const pathname = usePathname();

  return (
    <div className="max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-none">
      <nav className="space-y-6 pl-4 pb-10">
        {docSections.map((section) => (
          <div key={section.label}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </h4>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      {/* Left sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r">
        <div className="sticky top-[4.5rem] h-[calc(100vh-4.5rem)] overflow-y-auto scrollbar-none py-6 pr-4">
          <DocsSideNav />
        </div>
      </aside>

      {/* Center content */}
      <div className="flex-1 min-w-0">
        <div id="docs-content" className="max-w-3xl px-10 py-10">
          {children}
        </div>
      </div>

      {/* Right "On this page" ToC */}
      <aside className="hidden xl:block w-56 shrink-0">
        <div className="sticky top-[4.5rem] h-[calc(100vh-4.5rem)] overflow-y-auto scrollbar-none py-10 pr-4">
          <TableOfContents />
        </div>
      </aside>
    </div>
  );
}
