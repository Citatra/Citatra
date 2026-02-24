/**
 * Pusher server-side client.
 *
 * Triggers real-time events when new tracking data is fetched.
 * Configure PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, and PUSHER_CLUSTER
 * in your .env.local to enable real-time updates.
 */
import Pusher from "pusher";

let pusherInstance: Pusher | null = null;

function getPusher(): Pusher | null {
  if (pusherInstance) return pusherInstance;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    // Pusher not configured — real-time updates disabled
    return null;
  }

  pusherInstance = new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });

  return pusherInstance;
}

/**
 * Channel naming: `workspace-{workspaceId}`
 * Events:
 *   - `query:fetched`   — new AI Overview data for a query
 *   - `query:created`   — new query added
 *   - `query:updated`   — query status changed
 *   - `query:deleted`   — query removed
 *   - `stats:updated`   — dashboard stats changed
 *   - `notification:new` — new notification created
 */

export type PusherEventName =
  | "query:fetched"
  | "query:created"
  | "query:updated"
  | "query:deleted"
  | "stats:updated"
  | "notification:new";

export async function triggerEvent(
  workspaceId: string,
  event: PusherEventName,
  data: Record<string, unknown>
): Promise<void> {
  const pusher = getPusher();
  if (!pusher) return; // Real-time not configured — silently skip

  try {
    await pusher.trigger(`workspace-${workspaceId}`, event, data);
  } catch (error) {
    console.error(`Pusher trigger error (${event}):`, error);
    // Don't throw — real-time is a nice-to-have, not critical
  }
}

export function getPusherConfig() {
  return {
    key: process.env.PUSHER_KEY || "",
    cluster: process.env.PUSHER_CLUSTER || "",
  };
}
