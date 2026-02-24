"use client"

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Eye, MessageSquare, Hash } from "lucide-react";

type MetricTab = "visibility" | "sentiment" | "position";

const TIME_RANGES = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 14 days", value: "14" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 60 days", value: "60" },
];

export function CompetitiveOverviewChart({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [metric, setMetric] = useState<MetricTab>("visibility");
  const [visibleEntities, setVisibleEntities] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/competitive-overview?days=${days}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setVisibleEntities(new Set(json.entities.map((e: any) => e.key)));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workspaceId, days]);

  useEffect(() => { if (workspaceId) fetchData(); }, [workspaceId, fetchData]);

  const toggleEntity = (key: string) => {
    setVisibleEntities((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const selectAll = () => {
    if (!data) return;
    setVisibleEntities(new Set(data.entities.map((e: any) => e.key)));
  };

  const clearAll = () => {
    setVisibleEntities(new Set());
  };

  const chartLines = useMemo((): { dataKey: string; stroke: string; name: string }[] => {
    if (!data) return [];
    return data.entities.filter((e: any) => visibleEntities.has(e.key)).map((e: any) => ({ dataKey: `${e.key}_${metric}`, stroke: e.color, name: e.name }));
  }, [data, visibleEntities, metric]);

  const tabIcons: Record<MetricTab, any> = { visibility: Eye, sentiment: MessageSquare, position: Hash };

  const metricLabel: Record<MetricTab, string> = { visibility: "Visibility", sentiment: "Sentiment", position: "Avg Position" };
  const metricUnit: Record<MetricTab, string> = { visibility: "%", sentiment: "", position: "" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const dateStr = new Date(label).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return (
      <div className="rounded-lg border bg-background p-3 shadow-md text-sm min-w-[180px]">
        <p className="font-medium text-foreground mb-2">{dateStr}</p>
        <div className="space-y-1.5">
          {payload.map((entry: any) => (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                <span className="text-muted-foreground truncate max-w-[120px]">{entry.name}</span>
              </div>
              <span className="font-medium text-foreground tabular-nums">
                {entry.value != null ? `${entry.value}${metricUnit[metric]}` : "—"}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 border-t pt-1.5">{metricLabel[metric]}</p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Competitive Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={metric} onValueChange={(v) => setMetric(v as MetricTab)}>
              <TabsList className="h-8">
                {( ["visibility","sentiment","position"] as MetricTab[] ).map((tab) => {
                  const Icon = tabIcons[tab];
                  return (
                    <TabsTrigger key={tab} value={tab} className="text-xs px-3 h-7 gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {tab === "visibility" ? "Visibility" : tab === "sentiment" ? "Sentiment" : "Position"}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>

            {/* competitors dropdown moved into header */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-8 px-3 rounded-md border text-xs">Competitors ({visibleEntities.size})</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Competitors</DropdownMenuLabel>
                  {data?.entities?.map((ent: any) => (
                    <DropdownMenuCheckboxItem
                      key={ent.key}
                      checked={visibleEntities.has(ent.key)}
                      onCheckedChange={() => toggleEntity(ent.key)}
                    >
                      <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: ent.color }} />
                      <span className="truncate">{ent.isBrand ? "You" : ent.name}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <div className="px-1">
                    <DropdownMenuItem onClick={selectAll}>Select all</DropdownMenuItem>
                    <DropdownMenuItem onClick={clearAll}>Clear selection</DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <Select value={days} onValueChange={setDays}>
                  <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {TIME_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.timeSeries || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(val: string) => { const d = new Date(val); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {chartLines.map((line) => (
                    <Line key={line.dataKey} type="monotone" dataKey={line.dataKey} stroke={line.stroke} strokeWidth={2} name={line.name} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
        </div>
      </CardContent>
    </Card>
  );
}
