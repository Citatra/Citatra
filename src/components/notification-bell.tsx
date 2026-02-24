"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePusherWorkspace } from "@/lib/pusher-client";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const { activeWorkspace } = useWorkspace();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(
        `/api/workspaces/${activeWorkspace.id}/notifications?limit=10`
      );
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // silently fail
    }
  }, [activeWorkspace]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time: listen for new notifications
  usePusherWorkspace(activeWorkspace?.id || null, {
    "notification:new": () => {
      fetchNotifications();
    },
  });

  const markAllRead = async () => {
    if (!activeWorkspace) return;
    try {
      await fetch(`/api/workspaces/${activeWorkspace.id}/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // silently fail
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "brand_mentioned":
        return "🟢";
      case "brand_dropped":
        return "🔴";
      case "new_overview":
        return "🔵";
      case "weekly_digest":
        return "📊";
      default:
        return "🔔";
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline font-normal"
            >
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={`flex flex-col items-start gap-1 p-3 cursor-default ${
                !n.read ? "bg-accent/50" : ""
              }`}
            >
              <div className="flex items-center gap-2 w-full">
                <span>{getTypeIcon(n.type)}</span>
                <span className="font-medium text-sm flex-1 truncate">
                  {n.title}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(n.createdAt)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground pl-6 line-clamp-2">
                {n.message}
              </p>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
