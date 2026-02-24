"use client";

import { useState } from "react";
import { ChevronsUpDown, Plus, Building2 } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { MAX_WORKSPACES } from "@/lib/enterprise";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, setActiveWorkspace, refreshWorkspaces } =
    useWorkspace();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, domain: newDomain || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        if (err.error === "limit_exceeded") {
          alert(err.message);
        } else {
          console.error("Error creating workspace:", err.error);
        }
        return;
      }
      await refreshWorkspaces();
      setShowCreate(false);
      setNewName("");
      setNewDomain("");
    } catch (error) {
      console.error("Error creating workspace:", error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="w-full justify-between gap-2 px-2">
            <div className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate text-sm font-medium">
                {activeWorkspace?.name || "Select workspace"}
              </span>
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => setActiveWorkspace(ws)}
              className={
                ws.id === activeWorkspace?.id ? "bg-accent" : ""
              }
            >
              <Building2 className="mr-2 h-4 w-4" />
              <span className="truncate">{ws.name}</span>
            </DropdownMenuItem>
          ))}
          {workspaces.length < MAX_WORKSPACES && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create workspace
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
            <DialogDescription>
              Add a new workspace to organize your AI visibility tracking
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-name">Workspace Name</Label>
              <Input
                id="ws-name"
                placeholder="My Company AI Metrics"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-domain">Domain (optional)</Label>
              <Input
                id="ws-domain"
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
