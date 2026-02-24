"use client";

import { useState, useEffect, useMemo } from "react";
import { useWorkspace } from "@/components/workspace-provider";
import { RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Cron schedule: 2 AM UTC and 2 PM UTC every day.
 * - "twice_daily" → next of 2 AM / 2 PM
 * - "daily"       → next 2 AM only
 * - "weekly"      → next Monday 2 AM
 */
const CRON_HOURS = [2, 14]; // UTC hours when the cron fires

function getNextRefresh(frequency: string | undefined): Date {
  const now = new Date();
  const freq = frequency || "daily";

  if (freq === "twice_daily") {
    // Next 2 AM or 2 PM UTC
    for (const h of CRON_HOURS) {
      const candidate = new Date(now);
      candidate.setUTCHours(h, 0, 0, 0);
      if (candidate > now) return candidate;
    }
    // Both already passed today → tomorrow 2 AM
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(2, 0, 0, 0);
    return tomorrow;
  }

  if (freq === "daily") {
    // Next 2 AM UTC
    const today2am = new Date(now);
    today2am.setUTCHours(2, 0, 0, 0);
    if (today2am > now) return today2am;
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(2, 0, 0, 0);
    return tomorrow;
  }

  // "weekly" → next Monday 2 AM UTC
  const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
  // If today is Monday and it's before 2 AM, use today
  if (now.getUTCDay() === 1) {
    const today2am = new Date(now);
    today2am.setUTCHours(2, 0, 0, 0);
    if (today2am > now) return today2am;
  }
  const nextMon = new Date(now);
  nextMon.setUTCDate(nextMon.getUTCDate() + daysUntilMonday);
  nextMon.setUTCHours(2, 0, 0, 0);
  return nextMon;
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "now";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const FREQ_LABELS: Record<string, string> = {
  twice_daily: "Twice daily",
  daily: "Daily",
  weekly: "Weekly",
};

export function RefreshCountdown() {
  const { activeWorkspace } = useWorkspace();
  const freq = activeWorkspace?.updateFrequency || "daily";
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const nextRefresh = useMemo(() => getNextRefresh(freq), [freq, now]);
  const msLeft = nextRefresh.getTime() - now.getTime();
  const timeLeft = formatTimeLeft(msLeft);
  const freqLabel = FREQ_LABELS[freq] || freq;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-default select-none">
            <RefreshCw className="h-3 w-3" />
            <span className="tabular-nums">{timeLeft}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p>Next prompt refresh in <strong>{timeLeft}</strong></p>
          <p className="text-muted-foreground">
            Schedule: {freqLabel} &middot;{" "}
            {nextRefresh.toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
