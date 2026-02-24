"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  brandNames?: string[];
  keywords: string[];
  timezone: string;
  region?: string;
  language?: string;
  updateFrequency?: string;
  onboardingCompleted: boolean;
  role: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (workspace: Workspace) => void;
  refreshWorkspaces: () => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  activeWorkspace: null,
  setActiveWorkspace: () => {},
  refreshWorkspaces: async () => {},
  loading: true,
});

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces);

        // Set active workspace from localStorage or default to first
        const savedId =
          typeof window !== "undefined"
            ? localStorage.getItem("activeWorkspaceId")
            : null;
        const saved = data.workspaces.find(
          (ws: Workspace) => ws.id === savedId
        );
        if (saved) {
          setActiveWorkspaceState(saved);
        } else if (data.workspaces.length > 0) {
          setActiveWorkspaceState(data.workspaces[0]);
          if (typeof window !== "undefined") {
            localStorage.setItem(
              "activeWorkspaceId",
              data.workspaces[0].id
            );
          }
        }
      }
    } catch (error) {
      console.error("Failed to load workspaces:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  // Redirect to onboarding if the active workspace hasn't completed setup
  useEffect(() => {
    if (
      !loading &&
      activeWorkspace &&
      !activeWorkspace.onboardingCompleted &&
      pathname?.startsWith("/dashboard")
    ) {
      router.push("/onboarding");
    }
  }, [loading, activeWorkspace, pathname, router]);

  const setActiveWorkspace = (workspace: Workspace) => {
    setActiveWorkspaceState(workspace);
    if (typeof window !== "undefined") {
      localStorage.setItem("activeWorkspaceId", workspace.id);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        setActiveWorkspace,
        refreshWorkspaces,
        loading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
