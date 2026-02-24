"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { use } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface InvitationDetails {
  email: string;
  role: string;
  status: string;
  workspaceName: string;
  expiresAt: string;
}

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  const fetchInvitation = useCallback(async () => {
    try {
      const res = await fetch(`/api/invite/${token}`);
      if (res.ok) {
        const data = await res.json();
        setInvitation(data.invitation);
      } else {
        setError("Invitation not found or has expired");
      }
    } catch {
      setError("Failed to load invitation");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvitation();
  }, [fetchInvitation]);

  const handleAccept = async () => {
    if (!session) {
      router.push(`/login?callbackUrl=/invite/${token}`);
      return;
    }

    setAccepting(true);
    try {
      const res = await fetch(`/api/invite/${token}`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError(data.error || "Failed to accept invitation");
      }
    } catch {
      setError("Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading invitation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error}</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Workspace Invitation</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join a workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Workspace</span>
              <span className="text-sm font-medium">
                {invitation?.workspaceName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge variant="secondary">{invitation?.role}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Invited email
              </span>
              <span className="text-sm">{invitation?.email}</span>
            </div>
            {invitation?.status !== "pending" && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  variant={
                    invitation?.status === "accepted"
                      ? "default"
                      : "destructive"
                  }
                >
                  {invitation?.status}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          {invitation?.status === "pending" ? (
            <>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => router.push("/dashboard")}
              >
                Decline
              </Button>
              <Button
                className="flex-1"
                onClick={handleAccept}
                disabled={accepting}
              >
                {accepting
                  ? "Accepting..."
                  : session
                    ? "Accept Invitation"
                    : "Sign in to Accept"}
              </Button>
            </>
          ) : (
            <Button className="w-full" onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
