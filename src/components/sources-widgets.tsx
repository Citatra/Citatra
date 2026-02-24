"use client"

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, type PieLabelRenderProps } from "recharts";

export function SourceDomainsWidget({ workspaceId }: { workspaceId: string }) {
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/sources?view=domains&days=7&limit=5`);
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        setDomains(data.domains || []);
      } catch {}
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [workspaceId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Source Domains</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead className="text-center">Domain Type</TableHead>
                  <TableHead className="text-center">Used</TableHead>
                  <TableHead className="text-center">Avg. Citations</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
              {domains.map((d: any) => (
                <TableRow key={d.domain}>
                  <TableCell className="font-medium text-sm truncate">{d.domain}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs">
                      {d.domainType ?? "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="text-sm font-medium">{d.usedTotal ?? d.totalUrls ?? 0}</div>
                    {typeof d.usedPercent === "number" && (
                      <div className="text-xs text-muted-foreground">{`${d.usedPercent}%`}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">{d.avgCitations ?? "—"}</TableCell>
                </TableRow>
              ))}
              {domains.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground text-sm">No domains yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function SourceTypeDistributionWidget({ workspaceId }: { workspaceId: string }) {
  const [pieData, setPieData] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/sources?view=domains&days=7`);
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        const dist = data.typeDistribution || {};
        const arr = Object.entries(dist).map(([k, v]: any) => ({ name: k, value: v }));
        // attach fills based on color palette
        const withFill = arr.map((entry: any, i: number) => ({ ...entry, fill: colors[i % colors.length] }));
        setPieData(withFill);
      } catch {}
      finally { /* noop */ }
    })();
    return () => { mounted = false; };
  }, [workspaceId]);

  const colors = ["#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b", "#ef4444"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sources Type Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={126}
                paddingAngle={4}
                label={(props: PieLabelRenderProps) => `${props.name ?? ""} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
                fontSize={11}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

