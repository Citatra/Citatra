"use client";

import { useState, type ReactNode } from "react";
import {
  MoreHorizontal,
  Copy,
  ExternalLink,
  Eye,
  Flag,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

/* ------- Pre-built row action definitions ------- */

export interface RowAction {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  variant?: "default" | "destructive";
}

/** Generic row-actions dropdown (kebab menu). Pass any array of RowAction. */
export function RowActions({ actions }: { actions: RowAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {actions.map((action, i) => {
          const Icon = action.icon;
          const isDestructive = action.variant === "destructive";
          return (
            <span key={i}>
              {isDestructive && i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onClick={action.onClick}
                className={isDestructive ? "text-destructive focus:text-destructive" : ""}
              >
                <Icon className="mr-2 h-4 w-4" />
                {action.label}
              </DropdownMenuItem>
            </span>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------- Helper action factories ------- */

export function copyAction(text: string, label = "Copy"): RowAction {
  return {
    label,
    icon: Copy,
    onClick: () => {
      navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    },
  };
}

export function openUrlAction(url: string, label = "Open URL"): RowAction {
  return {
    label,
    icon: ExternalLink,
    onClick: () => window.open(url, "_blank"),
  };
}

export function viewDetailsAction(onClick: () => void): RowAction {
  return {
    label: "View Details",
    icon: Eye,
    onClick,
  };
}

export function flagAction(onClick: () => void): RowAction {
  return {
    label: "Flag for Review",
    icon: Flag,
    onClick,
  };
}

export function outreachAction(onClick: () => void): RowAction {
  return {
    label: "Start Outreach",
    icon: Send,
    onClick,
  };
}

export function deleteAction(onClick: () => void): RowAction {
  return {
    label: "Delete",
    icon: Trash2,
    onClick,
    variant: "destructive",
  };
}

/* ------- Inline quick actions (hover toolbar) ------- */

interface InlineActionsProps {
  children: ReactNode;
  actions: RowAction[];
}

/** Wraps table-row content with a hover-reveal action toolbar. */
export function InlineActions({ children, actions }: InlineActionsProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {hovered && actions.length > 0 && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-md border bg-background px-1 py-0.5 shadow-sm animate-in fade-in-50 duration-150">
          {actions.slice(0, 3).map((action, i) => {
            const Icon = action.icon;
            return (
              <Button
                key={i}
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  action.onClick();
                }}
                title={action.label}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            );
          })}
          {actions.length > 3 && <RowActions actions={actions} />}
        </div>
      )}
    </div>
  );
}
