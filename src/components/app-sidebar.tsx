"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  User,
  Swords,
  Lightbulb,
  Globe,
  FlaskConical,
  Network,
  Code2,
  FileCode,
  Link2,
  Plug,
  Target,
  PieChart,
  MousePointer,
  MapPin,
  BookOpen,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { NotificationBell } from "@/components/notification-bell";

// ─── Navigation definitions ─────────────────────────────────────────────────

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
}

// Core navigation (always visible)
const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Competitors", href: "/dashboard/competitors", icon: Swords },
  { title: "Prompts", href: "/dashboard/prompts", icon: FlaskConical },
  { title: "Sources", href: "/dashboard/sources", icon: Globe },
];

// Advanced analytics (enterprise)
const advancedItems: NavItem[] = [
  { title: "Traffic Attribution", href: "/dashboard/traffic-attribution", icon: MousePointer },
  { title: "SoV & Sentiment", href: "/dashboard/sov-sentiment", icon: PieChart },
  { title: "Competitive Gap", href: "/dashboard/competitive-gap", icon: Target },
  { title: "Backlinks", href: "/dashboard/backlinks", icon: Link2 },
];

// Technical analysis (enterprise)
const technicalItems: NavItem[] = [
  { title: "Semantic Map", href: "/dashboard/semantic-map", icon: Network },
  { title: "Schema Generator", href: "/dashboard/schema-generator", icon: Code2 },
  { title: "HTML Audit", href: "/dashboard/html-audit", icon: FileCode },
  { title: "GEO Audit", href: "/dashboard/geo-audit", icon: MapPin },
];

// Management
const managementItems: NavItem[] = [
  { title: "CMS Connectors", href: "/dashboard/cms-connectors", icon: Plug },
  { title: "Team", href: "/dashboard/team", icon: Users },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
  { title: "Documentation", href: "/dashboard/docs", icon: BookOpen },
];

// ─── Sidebar component ─────────────────────────────────────────────────────

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathname === item.href}>
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "U";

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            {mounted ? (
              <img
                src={
                  resolvedTheme === "dark"
                    ? "/citatra_dark.svg"
                    : "/citatra_light.svg"
                }
                alt="Citatra Logo"
                className="h-8 w-8 rounded-lg object-cover border border-gray-200 shadow"
                style={{ background: 'white' }}
              />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-muted/50 animate-pulse border border-gray-200 shadow" />
            )}
            <span className="text-xl font-bold">Citatra</span>
          </Link>
        </div>
        {mounted ? <WorkspaceSwitcher /> : (
          <div className="h-9 rounded-md bg-muted/50 animate-pulse" />
        )}
      </SidebarHeader>

      <SidebarContent>
        <NavGroup label="General" items={navItems} />
        <NavGroup label="Advanced Analytics" items={advancedItems} />
        <NavGroup label="Technical Analysis" items={technicalItems} />

        {/* Recommendations (enterprise) */}
        <SidebarGroup>
          <SidebarGroupLabel>Recommendations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={usePathname() === "/dashboard/recommendations"}>
                  <Link href="/dashboard/recommendations">
                    <Lightbulb className="h-4 w-4" />
                    <span>Recommendations</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <NavGroup label="Management" items={managementItems} />
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="flex items-center justify-between">
          {mounted ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md p-1 hover:bg-accent">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session?.user?.image || ""} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-medium truncate max-w-[120px]">
                      {session?.user?.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {session?.user?.email}
                    </span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2 p-1">
              <div className="h-8 w-8 rounded-full bg-muted/50 animate-pulse" />
              <div className="flex flex-col gap-1">
                <div className="h-3.5 w-20 rounded bg-muted/50 animate-pulse" />
                <div className="h-3 w-24 rounded bg-muted/50 animate-pulse" />
              </div>
            </div>
          )}
          <div className="flex items-center gap-1">
            {mounted ? (
              <NotificationBell />
            ) : (
              <div className="h-9 w-9 rounded-md bg-muted/50 animate-pulse" />
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
