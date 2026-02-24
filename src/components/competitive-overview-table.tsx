"use client"

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronUp, ChevronDown } from "lucide-react";

type SortField = "visibility" | "sentiment" | "position";
type SortDir = "asc" | "desc";

function ChangeIndicator({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const isPositive = invert ? value < 0 : value > 0;
  const isNegative = invert ? value > 0 : value < 0;
  if (value === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><ChevronUp className="h-3 w-3 opacity-30"/>0%</span>;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-emerald-600" : isNegative ? "text-red-600" : "text-muted-foreground"}`}>
      {isPositive ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {value > 0 ? "+" : ""}{value}%
    </span>
  );
}

export function CompetitiveOverviewTable({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [visibleEntities, setVisibleEntities] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("visibility");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/competitive-overview?days=${days}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setVisibleEntities(new Set(json.entities.map((e: any) => e.key)));
      }
    } catch {}
    finally { setLoading(false); }
  }, [workspaceId, days]);

  useEffect(() => { if (workspaceId) fetchData(); }, [workspaceId, fetchData]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(field); setSortDir("desc"); }
  };

  const sortedTableData = useMemo(() => {
    if (!data) return [];
    return [...data.tableData].sort((a: any, b: any) => {
      const aVal = a[sortField] ?? 999;
      const bVal = b[sortField] ?? 999;
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortField, sortDir]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Competitive Overview (Table)</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-auto max-h-[430px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="text-left font-medium px-3 py-2.5 text-sm">Entity</th>
                  <th className="text-center font-medium px-3 py-2.5 text-sm"><button onClick={() => handleSort("visibility")} className="inline-flex items-center gap-1">Visibility</button></th>
                  <th className="text-center font-medium px-3 py-2.5 text-sm"><button onClick={() => handleSort("sentiment")} className="inline-flex items-center gap-1">Sentiment</button></th>
                  <th className="text-center font-medium px-3 py-2.5 text-sm"><button onClick={() => handleSort("position")} className="inline-flex items-center gap-1">Position</button></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedTableData.map((row: any) => (
                  <tr key={row.key} className={`${row.isBrand ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                        <div className="min-w-0">
                          <span className="font-medium text-sm truncate block max-w-[200px]">{row.isBrand ? "You" : row.name}</span>
                          <span className="text-xs text-muted-foreground truncate block max-w-[200px]">{row.domain}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-sm">
                      <div className="space-y-0.5">
                        <span className="font-mono font-semibold text-sm">{row.visibility}%</span>
                        <div><ChangeIndicator value={row.visibilityChange} /></div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-sm">
                      <div className="space-y-0.5">
                        <span className="font-mono font-semibold text-sm">{row.sentiment}</span>
                        <div><ChangeIndicator value={row.sentimentChange} /></div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-sm">
                      <div className="space-y-0.5">
                        <span className="font-mono font-semibold text-sm">{row.position !== null ? row.position : "—"}</span>
                        <div><ChangeIndicator value={row.positionChange} invert /></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
