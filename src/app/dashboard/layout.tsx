import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import ClientAppSidebar from "@/components/client-app-sidebar";
import { WorkspaceProvider } from "@/components/workspace-provider";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CommandPalette } from "@/components/command-palette";
import { ThemeToggle } from "@/components/theme-toggle";
import { RefreshCountdown } from "@/components/refresh-countdown";
import { BookOpen } from "lucide-react";
import { EnterpriseRouteGuard } from "@/components/enterprise-route-guard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return (
    <WorkspaceProvider>
      <SidebarProvider>
        <ClientAppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-6" />
            <Breadcrumbs />
            <div className="ml-auto flex items-center gap-4">
              <RefreshCountdown />
              <Link
                href="/dashboard/docs"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Docs
              </Link>
              <ThemeToggle />
              <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border bg-muted px-2 text-[10px] font-mono text-muted-foreground ml-2">
                <span className="text-xs">⌘</span>K
              </kbd>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6">
            <EnterpriseRouteGuard>{children}</EnterpriseRouteGuard>
          </main>
        </SidebarInset>
        <CommandPalette />
      </SidebarProvider>
    </WorkspaceProvider>
  );
}
