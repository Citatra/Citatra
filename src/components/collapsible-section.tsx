"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CollapsibleSectionProps {
  title?: string;
  icon?: React.ElementType;
  defaultOpen?: boolean;
  children: ReactNode;
  variant?: "default" | "card";
}

export function CollapsibleSection({
  title = "Advanced Options",
  icon: Icon = Settings2,
  defaultOpen = false,
  children,
  variant = "default",
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (variant === "card") {
    return (
      <div className="rounded-lg border">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
        {open && (
          <div className="border-t px-4 py-4 animate-in fade-in-50 slide-in-from-top-2 duration-200">
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="h-8 px-2 text-muted-foreground hover:text-foreground"
      >
        <Icon className="mr-1.5 h-3.5 w-3.5" />
        {title}
        <ChevronDown
          className={`ml-1.5 h-3.5 w-3.5 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </Button>
      {open && (
        <div className="animate-in fade-in-50 slide-in-from-top-2 duration-200 pl-1">
          {children}
        </div>
      )}
    </div>
  );
}
