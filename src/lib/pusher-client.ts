"use client";

/**
 * Pusher client-side hook for real-time workspace updates.
 *
 * Usage:
 *   const { isConnected } = usePusherWorkspace(workspaceId, {
 *     "query:fetched": (data) => { ... },
 *     "stats:updated": (data) => { ... },
 *   });
 */
import { useEffect, useRef, useState } from "react";
import PusherClient from "pusher-js";
import type { Channel } from "pusher-js";

let pusherClient: PusherClient | null = null;

function getOrCreatePusherClient(
  key: string,
  cluster: string
): PusherClient | null {
  if (!key || !cluster) return null;
  if (pusherClient) return pusherClient;

  pusherClient = new PusherClient(key, {
    cluster,
  });

  return pusherClient;
}

type EventHandlers = Record<string, (data: Record<string, unknown>) => void>;

export function usePusherWorkspace(
  workspaceId: string | null,
  handlers: EventHandlers,
  config?: { key: string; cluster: string }
) {
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<Channel | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!workspaceId) return;

    const key = config?.key || process.env.NEXT_PUBLIC_PUSHER_KEY || "";
    const cluster =
      config?.cluster || process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "";

    const client = getOrCreatePusherClient(key, cluster);
    if (!client) return; // Pusher not configured

    const channelName = `workspace-${workspaceId}`;
    const channel = client.subscribe(channelName);
    channelRef.current = channel;

    channel.bind("pusher:subscription_succeeded", () => {
      setIsConnected(true);
    });

    // Bind all event handlers
    const eventNames = Object.keys(handlersRef.current);
    for (const eventName of eventNames) {
      channel.bind(eventName, (data: Record<string, unknown>) => {
        handlersRef.current[eventName]?.(data);
      });
    }

    return () => {
      for (const eventName of eventNames) {
        channel.unbind(eventName);
      }
      client.unsubscribe(channelName);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [workspaceId, config?.key, config?.cluster]);

  return { isConnected };
}
