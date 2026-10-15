import "server-only";

import { randomUUID } from "node:crypto";
import { after } from "next/server";

import type { InvalidationPlan } from "@/lib/cache/plan";
import { repos } from "@/lib/data";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

import { deliverAll, type DeliveryResult } from "./deliver";

// Emits webhook events: one delivery row per subscribed endpoint, then a
// signed send. Every cache invalidation emits "content.changed" with the
// tags and paths it refreshed (lib/cache/invalidate.ts), so a headless
// consumer can refresh the same things. Sends run after the response;
// failures are retried by the daily housekeeping cron (lib/cron/jobs.ts).

const QUICK_RETRY_MS = 5_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The key that opens endpoint secrets, or null when it is not configured. */
export function webhookMasterSecret(): string | null {
  return env.INTERNAL_SIGNING_SECRET ?? null;
}

/** Queues `event` for each target; returns the delivery ids. */
export async function emitEvent(event: string, data: unknown, targetIds?: string[]): Promise<string[]> {
  const targets = targetIds ? targetIds.map((id) => ({ id })) : await repos.webhooks.targetsFor(event);
  if (targets.length === 0) return [];
  const id = randomUUID();
  const payload = { id, type: event, createdAt: new Date().toISOString(), data };
  return repos.webhooks.enqueue(targets.map((target) => ({ endpointId: target.id, event, payload, idempotencyKey: `${id}:${target.id}` })));
}

/** Sends the given deliveries now. With `quickRetry`, failures get one more try a few seconds later. */
export async function deliverByIds(ids: string[], options: { quickRetry?: boolean } = {}): Promise<DeliveryResult[]> {
  const masterSecret = webhookMasterSecret();
  if (!masterSecret || ids.length === 0) return [];
  const deps = { repo: repos.webhooks, masterSecret };
  const results = await deliverAll(await repos.webhooks.findJobs(ids), deps);
  const failed = results.filter((result) => !result.ok && !result.skipped).map((result) => result.id);
  if (!options.quickRetry || failed.length === 0) return results;
  await sleep(QUICK_RETRY_MS);
  const retried = await deliverAll(await repos.webhooks.findJobs(failed), deps);
  const byId = new Map(retried.filter((result) => !result.skipped).map((result) => [result.id, result]));
  return results.map((result) => byId.get(result.id) ?? result);
}

/** Schedules "content.changed" for an invalidation, after the response. Never throws. */
export function notifyContentChanged(plan: InvalidationPlan): void {
  if (!webhookMasterSecret()) return;
  const data = {
    tags: [...new Set(plan.tags)],
    paths: [...new Set(plan.paths.map((entry) => (typeof entry === "string" ? entry : entry.path)))],
  };
  try {
    after(async () => {
      try {
        const ids = await emitEvent("content.changed", data);
        if (ids.length > 0) await deliverByIds(ids, { quickRetry: true });
      } catch (error) {
        log.warn("webhook emit failed", { error: error instanceof Error ? error.message : String(error) });
      }
    });
  } catch {
    // Outside a request (a script): there is no response to send after.
  }
}
