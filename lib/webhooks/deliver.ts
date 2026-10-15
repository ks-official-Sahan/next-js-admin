import type { DeliveryJob, WebhookRepo } from "@/lib/data/webhooks";

import { CLAIM_LEASE_MS, DELIVERY_TIMEOUT_MS, nextState } from "./policy";
import { openSecret } from "./secret-box";
import { SIGNATURE_HEADER, signWebhook } from "./signature";
import { resolvesPublic, webhookUrlProblem, type Lookup } from "./url-guard";

// One signed POST per delivery. Dependencies come in as arguments (the repo,
// the key, fetch, DNS), so every branch is unit tested without a network.

export interface DeliverDeps {
  repo: Pick<WebhookRepo, "claim" | "finish">;
  /** INTERNAL_SIGNING_SECRET: opens the endpoint secrets. */
  masterSecret: string;
  fetch?: typeof fetch;
  lookup?: Lookup;
  now?: () => number;
}

export interface DeliveryResult {
  id: string;
  ok: boolean;
  /** Not attempted: another worker holds this delivery. */
  skipped?: boolean;
  status?: number;
  error?: string;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

async function send(job: DeliveryJob, deps: DeliverDeps, now: number): Promise<{ ok: boolean; status?: number; error?: string }> {
  const { url, secretCipher, active } = job.endpoint;
  if (!active) return { ok: false, error: "The endpoint is turned off." };
  const problem = webhookUrlProblem(url);
  if (problem) return { ok: false, error: problem };
  if (!(await resolvesPublic(url, deps.lookup))) return { ok: false, error: "The endpoint's host resolves to a private address." };

  const body = JSON.stringify(job.payload);
  const response = await (deps.fetch ?? fetch)(url, {
    method: "POST",
    body,
    // A redirect could point anywhere, including inside the network.
    redirect: "manual",
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "user-agent": "Admin-Webhooks/1",
      [SIGNATURE_HEADER]: signWebhook(openSecret(secretCipher, deps.masterSecret), body, Math.floor(now / 1000)),
      "Idempotency-Key": job.idempotencyKey,
      "X-Webhook-Event": job.event,
      "X-Webhook-Delivery": job.id,
    },
  });
  // The response body is never read: a consumer only has to answer 2xx.
  await response.body?.cancel().catch(() => undefined);
  return response.status >= 200 && response.status < 300 ? { ok: true, status: response.status } : { ok: false, status: response.status, error: `HTTP ${response.status}` };
}

export async function deliverOne(job: DeliveryJob, deps: DeliverDeps): Promise<DeliveryResult> {
  const now = deps.now?.() ?? Date.now();
  if (job.status !== "PENDING" || !(await deps.repo.claim(job.id, job.attempts, new Date(now + CLAIM_LEASE_MS)))) {
    return { id: job.id, ok: false, skipped: true };
  }
  let result: { ok: boolean; status?: number; error?: string };
  try {
    result = await send(job, deps, now);
  } catch (error) {
    result = { ok: false, error: message(error) };
  }
  await deps.repo.finish(job.id, {
    ...nextState(job.attempts + 1, result.ok, now),
    responseStatus: result.status ?? null,
    lastError: result.ok ? null : (result.error ?? "Delivery failed."),
    deliveredAt: result.ok ? new Date(now) : null,
  });
  return { id: job.id, ...result };
}

/** Sends jobs with at most `concurrency` requests in flight. */
export async function deliverAll(jobs: DeliveryJob[], deps: DeliverDeps, concurrency = 4): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      results.push(await deliverOne(job, deps));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}
