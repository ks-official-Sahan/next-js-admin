// Outgoing webhook rules: which events exist and how a failed delivery is
// retried. Pure, so the schedule is unit tested and shared by the
// immediate send, the manual retry and the daily cron.

export const WEBHOOK_EVENTS = ["content.changed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
/** Sent only by the "Send test" button, to the one endpoint being tested. */
export const PING_EVENT = "webhook.ping";

export const WEBHOOK_EVENT_LABEL: Record<WebhookEvent, string> = {
  "content.changed": "Content changed (any publish, edit or delete that refreshes the public site)",
};

/** Attempts before a delivery is given up as FAILED. */
export const MAX_ATTEMPTS = 6;
/** Wait after attempt n (1-based) before the next one. The cron runs daily, so later waits round up to its next run. */
export const RETRY_DELAYS_MS = [60_000, 10 * 60_000, 60 * 60_000, 6 * 3_600_000, 24 * 3_600_000] as const;
export const DELIVERY_TIMEOUT_MS = 5_000;
/** A claimed delivery is not picked up by another worker for this long. */
export const CLAIM_LEASE_MS = 60_000;
/** Delivery history older than this is pruned by the housekeeping cron. */
export const DELIVERY_KEEP_DAYS = 30;
export const MAX_ENDPOINTS = 10;

export type DeliveryStatus = "PENDING" | "DELIVERED" | "FAILED";

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/** The status after attempt number `attempts` (1-based) succeeded or failed. */
export function nextState(attempts: number, ok: boolean, now: number): { status: DeliveryStatus; nextAttemptAt: Date | null } {
  if (ok) return { status: "DELIVERED", nextAttemptAt: null };
  if (attempts >= MAX_ATTEMPTS) return { status: "FAILED", nextAttemptAt: null };
  const wait = RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1];
  return { status: "PENDING", nextAttemptAt: new Date(now + wait) };
}
