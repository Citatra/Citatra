"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronUp,
  ChevronDown,
  Eye,
  MessageSquare,
  Hash,
} from "lucide-react";
import { ChartSkeleton, TableSkeleton } from "@/components/loading-skeletons";

// ---- Types ----

interface Entity {
  key: string;
  name: string;
  domain: string;
  color: string;
  isBrand: boolean;
}

interface TableRow {
  key: string;
  name: string;
  domain: string;
  color: string;
  isBrand: boolean;
  visibility: number;
  visibilityChange: number | null;
  sentiment: number;
  sentimentChange: number | null;
  position: number | null;
  positionChange: number | null;
}

interface OverviewData {
  period: { days: number; since: string };
  entities: Entity[];
  timeSeries: Record<string, unknown>[];
  tableData: TableRow[];
}

type MetricTab = "visibility" | "sentiment" | "position";
type SortField = "visibility" | "sentiment" | "position";
type SortDir = "asc" | "desc";

const TIME_RANGES = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 14 days", value: "14" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 60 days", value: "60" },
  { label: "Last 90 days", value: "90" },
];

// ---- Helpers ----

function ChangeIndicator({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  // For position, lower is better so invert colors
  const isPositive = invert ? value < 0 : value > 0;
  const isNegative = invert ? value > 0 : value < 0;
  if (value === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        0%
      </span>
    );
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isPositive
          ? "text-emerald-600 dark:text-emerald-400"
          : isNegative
          ? "text-red-600 dark:text-red-400"
          : "text-muted-foreground"
      }`}
    >
      {value > 0 ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}

function SortButton({
  field,
  sortField,
  sortDir,
  onSort,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
    >
      {isActive ? (
        sortDir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ChevronDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
}

// ---- Custom Tooltip ----

function ChartTooltipContent({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload,
  label,
  metric,
  entities,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  metric: MetricTab;
  entities: Entity[];
}) {
  if (!payload || payload.length === 0) return null;

  const unitLabel =
    metric === "visibility"
      ? "% visibility"
      : metric === "sentiment"
      ? " sentiment"
      : " avg pos.";

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm">
      <p className="font-medium text-muted-foreground mb-2">{label}</p>
      <div className="space-y-1">
        {payload.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (entry: any) => {
            const entityKey = entry.dataKey?.replace(`_${metric}`, "");
            const entity = entities.find((e) => e.key === entityKey);
            return (
              <div key={entry.dataKey} className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-foreground truncate max-w-[140px]">
                    {entity?.name || entityKey}
                  </span>
                </div>
                <span className="font-mono font-medium tabular-nums">
                  {entry.value != null ? entry.value : "—"}
                  {entry.value != null ? unitLabel : ""}
                </span>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

// ---- Main Component ----

export function CompetitiveOverview({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [metric, setMetric] = useState<MetricTab>("visibility");
  const [visibleEntities, setVisibleEntities] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("visibility");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/competitive-overview?days=${days}`
      );
      if (res.ok) {
        const json: OverviewData = await res.json();
        setData(json);
        // Default: all entities visible
        setVisibleEntities(new Set(json.entities.map((e) => e.key)));
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [workspaceId, days]);

  useEffect(() => {
    if (workspaceId) fetchData();
  }, [workspaceId, fetchData]);

  const toggleEntity = (key: string) => {
    setVisibleEntities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedTableData = useMemo(() => {
    if (!data) return [];
    return [...data.tableData].sort((a, b) => {
      const aVal = a[sortField] ?? 999;
      const bVal = b[sortField] ?? 999;
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [data, sortField, sortDir]);

  // Chart lines based on visible entities
  const chartLines = useMemo(() => {
    if (!data) return [];
    return data.entities
      .filter((e) => visibleEntities.has(e.key))
      .map((e) => ({
        dataKey: `${e.key}_${metric}`,
        stroke: e.color,
        name: e.name,
      }));
  }, [data, visibleEntities, metric]);

  const metricLabel =
    metric === "visibility"
      ? "Visibility %"
      : metric === "sentiment"
      ? "Sentiment Score"
      : "Avg. Position";

  const tabIcons: Record<MetricTab, typeof Eye> = {
    visibility: Eye,
    sentiment: MessageSquare,
    position: Hash,
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
            <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <ChartSkeleton height="h-[380px]" />
            <TableSkeleton rows={4} cols={4} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.entities.length === 0) {
    return null; // No data or no competitors — hide the section
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Competitive Overview</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* ---- LEFT: Chart ---- */}
          <div className="space-y-3">
            {/* Metric tabs */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Tabs
                value={metric}
                onValueChange={(v) => setMetric(v as MetricTab)}
              >
                <TabsList className="h-8">
                  {(["visibility", "sentiment", "position"] as MetricTab[]).map(
                    (tab) => {
                      const Icon = tabIcons[tab];
                      return (
                        <TabsTrigger
                          key={tab}
                          value={tab}
                          className="text-xs px-3 h-7 gap-1.5"
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {tab === "visibility"
                            ? "Visibility"
                            : tab === "sentiment"
                            ? "Sentiment"
                            : "Position"}
                        </TabsTrigger>
                      );
                    }
                  )}
                </TabsList>
              </Tabs>

              {/* Entity toggles */}
              <div className="flex flex-wrap gap-2">
                {data.entities.map((ent) => (
                  <label
                    key={ent.key}
                    className="inline-flex items-center gap-1.5 cursor-pointer text-xs"
                  >
                    <Checkbox
                      checked={visibleEntities.has(ent.key)}
                      onCheckedChange={() => toggleEntity(ent.key)}
                      className="h-3.5 w-3.5"
                      style={
                        visibleEntities.has(ent.key)
                          ? ({ "--color-primary": ent.color, borderColor: ent.color } as React.CSSProperties)
                          : undefined
                      }
                    />
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: ent.color }}
                    />
                    <span className="text-muted-foreground truncate max-w-[100px]">
                      {ent.isBrand ? "You" : ent.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Chart */}
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.timeSeries}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted/50"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    tickFormatter={(val: string) => {
                      const d = new Date(val);
                      return d.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      });
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                    width={40}
                    domain={
                      metric === "position"
                        ? ["auto", "auto"]
                        : [0, "auto"]
                    }
                    reversed={metric === "position"}
                    label={{
                      value: metricLabel,
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
                    }}
                  />
                  <RechartsTooltip
                    content={
                      <ChartTooltipContent
                        metric={metric}
                        entities={data.entities}
                      />
                    }
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  />
                  {chartLines.map((line) => (
                    <Line
                      key={line.dataKey}
                      type="monotone"
                      dataKey={line.dataKey}
                      stroke={line.stroke}
                      strokeWidth={2}
                      name={line.name}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ---- RIGHT: Table ---- */}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-auto max-h-[430px]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr>
                    <th className="text-left font-medium px-3 py-2.5 text-xs text-muted-foreground">
                      Entity
                    </th>
                    <th className="text-right font-medium px-3 py-2.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        Visibility
                        <SortButton
                          field="visibility"
                          sortField={sortField}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                      </span>
                    </th>
                    <th className="text-right font-medium px-3 py-2.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        Sentiment
                        <SortButton
                          field="sentiment"
                          sortField={sortField}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                      </span>
                    </th>
                    <th className="text-right font-medium px-3 py-2.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        Position
                        <SortButton
                          field="position"
                          sortField={sortField}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedTableData.map((row) => (
                    <tr
                      key={row.key}
                      className={`hover:bg-muted/30 transition-colors ${
                        row.isBrand ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                          <div className="min-w-0">
                            <span className="font-medium text-sm truncate block max-w-[120px]">
                              {row.isBrand ? "You" : row.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate block max-w-[120px]">
                              {row.domain}
                            </span>
                          </div>
                          {row.isBrand && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 shrink-0"
                            >
                              You
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="space-y-0.5">
                          <span className="font-mono font-semibold text-sm tabular-nums">
                            {row.visibility}%
                          </span>
                          <div>
                            <ChangeIndicator value={row.visibilityChange} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="space-y-0.5">
                          <span className="font-mono font-semibold text-sm tabular-nums">
                            {row.sentiment}
                          </span>
                          <div>
                            <ChangeIndicator value={row.sentimentChange} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="space-y-0.5">
                          <span className="font-mono font-semibold text-sm tabular-nums">
                            {row.position !== null ? row.position : "—"}
                          </span>
                          <div>
                            <ChangeIndicator
                              value={row.positionChange}
                              invert
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
