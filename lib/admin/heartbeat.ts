// Decisions of the session heartbeat, pure so they are unit tested. The client
// polls /api/auth/session-status every 30 seconds and when the tab comes back,
// and sends a browser whose session ended to /api/auth/expire
// (design notes, section 6.3).

export const HEARTBEAT_MS = 30_000;
const MAX_RETRY_MS = 5 * 60_000;

export type HeartbeatOutcome = "ok" | "expired" | "retry";

/** `null` means the request itself failed (offline, server down). */
export function heartbeatDecision(response: { status: number; active?: unknown } | null): HeartbeatOutcome {
  if (!response) return "retry";
  if (response.status === 200) return response.active === true ? "ok" : "expired";
  if (response.status === 401 || response.status === 403 || response.status === 404) return "expired";
  return "retry";
}

/** Delay before the next poll: the normal interval, backing off while the server is unreachable. */
export function nextDelay(outcome: HeartbeatOutcome, consecutiveRetries: number): number {
  if (outcome !== "retry") return HEARTBEAT_MS;
  return Math.min(HEARTBEAT_MS * 2 ** Math.max(0, consecutiveRetries), MAX_RETRY_MS);
}

/** On focus: poll again only when the last check is older than the interval. */
export function shouldPollOnFocus(now: number, lastCheckAt: number | null): boolean {
  return lastCheckAt === null || now - lastCheckAt >= HEARTBEAT_MS;
}
