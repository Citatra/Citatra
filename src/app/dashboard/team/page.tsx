"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, Trash2, Copy, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/loading-skeletons";

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  image?: string;
  role: string;
  joinedAt: string;
}

interface InvitationItem {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export default function TeamPage() {
  const { activeWorkspace } = useWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [currentRole, setCurrentRole] = useState("");
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/members`
      );
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members);
        setCurrentRole(data.currentRole);
      }
    } catch (error) {
      console.error("Error fetching members:", error);
    }
  }, [activeWorkspace]);

  const fetchInvitations = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/invitations`
      );
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations);
      }
    } catch (error) {
      console.error("Error fetching invitations:", error);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (activeWorkspace) {
      setLoading(true);
      Promise.all([fetchMembers(), fetchInvitations()]).finally(() =>
        setLoading(false)
      );
    }
  }, [activeWorkspace, fetchMembers, fetchInvitations]);

  const handleInvite = async () => {
    if (!activeWorkspace || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(`Invitation sent to ${inviteEmail}`);
        setShowInvite(false);
        setInviteEmail("");
        setInviteRole("viewer");
        fetchInvitations();

        // Copy invite URL
        if (data.invitation?.inviteUrl) {
          navigator.clipboard.writeText(data.invitation.inviteUrl);
          toast.info("Invitation link copied to clipboard");
        }
      } else {
        toast.error(data.error || "Failed to send invitation");
      }
    } catch {
      toast.error("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (memberId: string, role: string) => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/members/${memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
      if (res.ok) {
        toast.success("Role updated");
        fetchMembers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update role");
      }
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleRemoveMember = async (memberId: string, name: string) => {
    if (!activeWorkspace) return;
    if (!confirm(`Remove ${name} from the workspace?`)) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/members/${memberId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast.success(`${name} removed from workspace`);
        fetchMembers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to remove member");
      }
    } catch {
      toast.error("Failed to remove member");
    }
  };

  const isAdmin = ["owner", "admin"].includes(currentRole);

  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Select a workspace first</p>
      </div>
    );
  }

  if (loading) {
    return <TableSkeleton rows={4} cols={4} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description={`Manage members of ${activeWorkspace.name}`}
        helpText="Invite team members to collaborate on this workspace. Admins can manage roles and remove members."
        actions={
        isAdmin ? (
          <Dialog open={showInvite} onOpenChange={setShowInvite}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Send an invitation link to add someone to this workspace
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email Address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="teammate@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      {currentRole === "owner" && (
                        <SelectItem value="admin">Admin</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowInvite(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                >
                  {inviting ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : undefined
        }
      />

      {/* Members table */}
      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
          <CardDescription>
            People who have access to this workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.image || ""} />
                        <AvatarFallback>
                          {member.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{member.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isAdmin && member.role !== "owner" ? (
                      <Select
                        value={member.role}
                        onValueChange={(role) =>
                          handleUpdateRole(member.id, role)
                        }
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          {currentRole === "owner" && (
                            <SelectItem value="admin">Admin</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{member.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {member.joinedAt
                      ? new Date(member.joinedAt).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {member.role !== "owner" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleRemoveMember(member.id, member.name)
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {isAdmin && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations ({invitations.length})</CardTitle>
            <CardDescription>
              Invitations that haven&apos;t been accepted yet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{inv.role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${window.location.origin}/invite/${inv.id}`
                          );
                          setCopiedUrl(inv.id);
                          setTimeout(() => setCopiedUrl(null), 2000);
                          toast.success("Link copied");
                        }}
                      >
                        {copiedUrl === inv.id ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
