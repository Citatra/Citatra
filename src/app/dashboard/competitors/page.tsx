"use client";

import { useWorkspace } from "@/components/workspace-provider";
import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  Globe,
  Swords,
  X,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatGridSkeleton, TableSkeleton } from "@/components/loading-skeletons";

interface Competitor {
  id: string;
  name: string;
  domain: string;
  alternativeNames: string[];
  alternativeDomains: string[];
  color: string;
  notes: string;
  createdAt: string;
}

/* ── Tag Input helper ─────────────────────────────────────── */
function TagInput({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={!input.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {values.map((v, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1">
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

const DEFAULT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export default function CompetitorsPage() {
  const { activeWorkspace, loading: wsLoading } = useWorkspace();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<Competitor | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [newNotes, setNewNotes] = useState("");
  const [newAltNames, setNewAltNames] = useState<string[]>([]);
  const [newAltDomains, setNewAltDomains] = useState<string[]>([]);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAltNames, setEditAltNames] = useState<string[]>([]);
  const [editAltDomains, setEditAltDomains] = useState<string[]>([]);

  const fetchCompetitors = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/competitors`
      );
      if (res.ok) {
        const data = await res.json();
        setCompetitors(data.competitors);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (activeWorkspace) {
      setLoading(true);
      fetchCompetitors();
    }
  }, [activeWorkspace, fetchCompetitors]);

  const handleAdd = async () => {
    if (!activeWorkspace || !newName || !newDomain) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/competitors`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName,
            domain: newDomain,
            color: newColor,
            notes: newNotes,
            alternativeNames: newAltNames,
            alternativeDomains: newAltDomains,
          }),
        }
      );
      if (res.ok) {
        toast.success("Competitor added");
        setAddOpen(false);
        setNewName("");
        setNewDomain("");
        setNewColor(
          DEFAULT_COLORS[(competitors.length + 1) % DEFAULT_COLORS.length]
        );
        setNewNotes("");
        setNewAltNames([]);
        setNewAltDomains([]);
        fetchCompetitors();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add competitor");
      }
    } catch {
      toast.error("Failed to add competitor");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (comp: Competitor) => {
    setEditingComp(comp);
    setEditName(comp.name);
    setEditColor(comp.color);
    setEditNotes(comp.notes);
    setEditAltNames(comp.alternativeNames ?? []);
    setEditAltDomains(comp.alternativeDomains ?? []);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!activeWorkspace || !editingComp) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/competitors/${editingComp.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName,
            color: editColor,
            notes: editNotes,
            alternativeNames: editAltNames,
            alternativeDomains: editAltDomains,
          }),
        }
      );
      if (res.ok) {
        toast.success("Competitor updated");
        setEditOpen(false);
        fetchCompetitors();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update competitor");
      }
    } catch {
      toast.error("Failed to update competitor");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (comp: Competitor) => {
    if (!activeWorkspace) return;
    if (!confirm(`Remove competitor "${comp.name}" (${comp.domain})?`)) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/competitors/${comp.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast.success("Competitor removed");
        fetchCompetitors();
      } else {
        toast.error("Failed to remove competitor");
      }
    } catch {
      toast.error("Failed to remove competitor");
    }
  };

  if (wsLoading) {
    return (
      <div className="space-y-6">
        <StatGridSkeleton count={3} />
        <TableSkeleton rows={5} cols={5} />
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-semibold">No workspace selected</h2>
          <p className="text-muted-foreground mt-2">
            Select a workspace to manage competitors
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Competitors"
        description="Track competitor domains alongside your brand in AI Overviews"
        helpText="Add competitor domains to see how often they appear in AI Overviews for your tracked keywords versus your own site."
        actions={
        <div className="flex items-center gap-2">
          <Link href="/dashboard/competitors/compare">
            <Button variant="outline" size="sm">
              <Swords className="h-4 w-4 mr-1" />
              Compare
            </Button>
          </Link>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Competitor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Competitor</DialogTitle>
                <DialogDescription>
                  Add a competitor domain to compare AI visibility against yours.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Competitor Name</Label>
                  <Input
                    placeholder="e.g. Acme Corp"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Domain</Label>
                  <Input
                    placeholder="e.g. acme.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Chart Color</Label>
                  <div className="flex gap-2">
                    {DEFAULT_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNewColor(c)}
                        className={`w-8 h-8 rounded-full border-2 ${
                          newColor === c
                            ? "border-foreground scale-110"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    placeholder="Any notes about this competitor..."
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    rows={2}
                  />
                </div>
                <TagInput
                  label="Alternative Names (optional)"
                  placeholder="e.g. Acme Inc, press Enter to add"
                  values={newAltNames}
                  onChange={setNewAltNames}
                />
                <TagInput
                  label="Alternative Domains (optional)"
                  placeholder="e.g. acme.co.uk, press Enter to add"
                  values={newAltDomains}
                  onChange={setNewAltDomains}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={saving || !newName || !newDomain}
                >
                  {saving ? "Adding..." : "Add Competitor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        }
      />

      {/* Competitors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Tracked Competitors</CardTitle>
          <CardDescription>
            {competitors.length === 0
              ? "No competitors tracked yet — add one to start comparing."
              : `${competitors.length} competitor${competitors.length > 1 ? "s" : ""} being tracked`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : competitors.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Globe className="h-10 w-10 mb-2 opacity-40" />
              <p>No competitors added yet</p>
              <p className="text-sm">
                Click &quot;Add Competitor&quot; to start tracking
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Color</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Alt Names</TableHead>
                  <TableHead>Alt Domains</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((comp) => (
                  <TableRow key={comp.id}>
                    <TableCell>
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: comp.color }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{comp.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{comp.domain}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(comp.alternativeNames ?? []).length > 0
                          ? comp.alternativeNames.map((n, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {n}
                              </Badge>
                            ))
                          : <span className="text-muted-foreground text-sm">—</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(comp.alternativeDomains ?? []).length > 0
                          ? comp.alternativeDomains.map((d, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {d}
                              </Badge>
                            ))
                          : <span className="text-muted-foreground text-sm">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                      {comp.notes || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(comp.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(comp)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(comp)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {competitors.length > 0 && (
          <CardFooter>
            <Link href="/dashboard/competitors/compare">
              <Button variant="outline" size="sm">
                <Swords className="h-4 w-4 mr-1" />
                View Comparison Analytics
              </Button>
            </Link>
          </CardFooter>
        )}
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Competitor</DialogTitle>
            <DialogDescription>
              Update competitor details for {editingComp?.domain}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Input value={editingComp?.domain || ""} disabled />
              <p className="text-xs text-muted-foreground">
                Domain cannot be changed. Remove and re-add instead.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Chart Color</Label>
              <div className="flex gap-2">
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColor(c)}
                    className={`w-8 h-8 rounded-full border-2 ${
                      editColor === c
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
              />
            </div>
            <TagInput
              label="Alternative Names"
              placeholder="e.g. Acme Inc, press Enter to add"
              values={editAltNames}
              onChange={setEditAltNames}
            />
            <TagInput
              label="Alternative Domains"
              placeholder="e.g. acme.co.uk, press Enter to add"
              values={editAltDomains}
              onChange={setEditAltDomains}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={saving || !editName}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
