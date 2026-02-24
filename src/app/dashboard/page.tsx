"use client";

import { useWorkspace } from "@/components/workspace-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import { CompetitiveOverviewChart } from "@/components/competitive-overview-chart";
import { CompetitiveOverviewTable } from "@/components/competitive-overview-table";
import {
  SourceDomainsWidget,
  SourceTypeDistributionWidget,
} from "@/components/sources-widgets";

export default function DashboardPage() {
  const { activeWorkspace } = useWorkspace();

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description={`AI Overview visibility monitoring for ${activeWorkspace?.name ?? ""}`}
          helpText="Selected widgets"
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_456px]">
          <CompetitiveOverviewChart workspaceId={activeWorkspace?.id ?? ""} />
          <CompetitiveOverviewTable workspaceId={activeWorkspace?.id ?? ""} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SourceDomainsWidget workspaceId={activeWorkspace?.id ?? ""} />
          <div className="flex flex-col gap-4">
            <SourceTypeDistributionWidget workspaceId={activeWorkspace?.id ?? ""} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
