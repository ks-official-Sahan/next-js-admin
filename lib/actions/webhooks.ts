"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/actions/guard";
import type { ActionState } from "@/lib/actions/state";
import { done, fail } from "@/lib/actions/state";
import { audit } from "@/lib/admin/audit";
import { repos, withTx } from "@/lib/data";
import { log } from "@/lib/log";
import { deliverByIds, emitEvent, webhookMasterSecret } from "@/lib/webhooks/dispatch";
import { isWebhookEvent, MAX_ENDPOINTS, PING_EVENT } from "@/lib/webhooks/policy";
import { newWebhookSecret, sealSecret } from "@/lib/webhooks/secret-box";
import { webhookUrlProblem } from "@/lib/webhooks/url-guard";

// Outgoing webhook endpoints (/admin/webhooks). Same gate as the rest of the
// site's operational settings: manageSettings. A signing secret is shown once,
// in the action's response, and stored encrypted (lib/webhooks/secret-box.ts).

const WEBHOOKS_PATH = "/admin/webhooks";
const NO_KEY = "Webhooks need INTERNAL_SIGNING_SECRET to be set on the server.";
const DESCRIPTION_MAX = 200;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function createWebhookAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("manageSettings");
  if (!auth.ok) return fail(auth.error);
  const master = webhookMasterSecret();
  if (!master) return fail(NO_KEY);

  const url = String(formData.get("url") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const events = [...new Set(formData.getAll("events").map(String))];
  const urlProblem = webhookUrlProblem(url);
  if (urlProblem) return fail(urlProblem, { url: urlProblem });
  if (description.length > DESCRIPTION_MAX) return fail("The description is too long.", { description: `Keep it under ${DESCRIPTION_MAX} characters.` });
  if (!events.every(isWebhookEvent)) return fail("Choose events from the list.");

  try {
    if ((await repos.webhooks.countEndpoints()) >= MAX_ENDPOINTS) return fail(`You can have up to ${MAX_ENDPOINTS} endpoints.`);
    const secret = newWebhookSecret();
    await withTx(async (tx) => {
      const endpoint = await tx.webhooks.createEndpoint({ url, description, events, secretCipher: sealSecret(secret, master), createdById: auth.user.id });
      await audit(
        { action: "webhook.created", actor: auth.user, entityType: "WebhookEndpoint", entityId: endpoint.id, after: { url, description, events } },
        tx
      );
    });
    revalidatePath(WEBHOOKS_PATH);
    return done("Endpoint added. Copy its signing secret now: it is not shown again.", { secret });
  } catch (error) {
    log.error("webhook create failed", { error: errorText(error) });
    return fail("Something went wrong. Please try again.");
  }
}

async function endpointAction(
  formData: FormData,
  run: (endpointId: string, actor: { id: string; email: string }, master: string) => Promise<ActionState>
): Promise<ActionState> {
  const auth = await authorizeAction("manageSettings");
  if (!auth.ok) return fail(auth.error);
  const master = webhookMasterSecret();
  if (!master) return fail(NO_KEY);
  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Endpoint not found.");
  try {
    return await run(id, auth.user, master);
  } catch (error) {
    log.error("webhook action failed", { error: errorText(error) });
    return fail("Something went wrong. Please try again.");
  }
}

export async function toggleWebhookAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const active = formData.get("active") === "true";
  return endpointAction(formData, async (id, actor) => {
    const updated = await withTx(async (tx) => {
      const row = await tx.webhooks.updateEndpoint(id, { active });
      if (row) await audit({ action: active ? "webhook.enabled" : "webhook.disabled", actor, entityType: "WebhookEndpoint", entityId: id }, tx);
      return row;
    });
    if (!updated) return fail("Endpoint not found.");
    revalidatePath(WEBHOOKS_PATH);
    return done(active ? "Endpoint turned on." : "Endpoint turned off. Nothing is sent to it until you turn it on.");
  });
}

export async function rotateWebhookSecretAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return endpointAction(formData, async (id, actor, master) => {
    const secret = newWebhookSecret();
    const updated = await withTx(async (tx) => {
      const row = await tx.webhooks.updateEndpoint(id, { secretCipher: sealSecret(secret, master) });
      if (row) await audit({ action: "webhook.secret_rotated", actor, entityType: "WebhookEndpoint", entityId: id }, tx);
      return row;
    });
    if (!updated) return fail("Endpoint not found.");
    return done("New secret made. The old one stops working now: update your consumer with this one.", { secret });
  });
}

export async function deleteWebhookAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return endpointAction(formData, async (id, actor) => {
    const deleted = await withTx(async (tx) => {
      const before = await tx.webhooks.findEndpoint(id);
      if (!before || !(await tx.webhooks.deleteEndpoint(id))) return false;
      await audit(
        { action: "webhook.deleted", actor, entityType: "WebhookEndpoint", entityId: id, before: { url: before.url, description: before.description, events: before.events } },
        tx
      );
      return true;
    });
    if (!deleted) return fail("Endpoint not found.");
    revalidatePath(WEBHOOKS_PATH);
    return done("Endpoint deleted, with its delivery history.");
  });
}

export async function testWebhookAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return endpointAction(formData, async (id) => {
    if (!(await repos.webhooks.findEndpoint(id))) return fail("Endpoint not found.");
    const ids = await emitEvent(PING_EVENT, { message: "Test delivery from the admin panel." }, [id]);
    const [result] = await deliverByIds(ids);
    revalidatePath(WEBHOOKS_PATH);
    return result?.ok ? done(`Test delivered (HTTP ${result.status}).`) : fail(`Test failed: ${result?.error ?? "not sent"}.`);
  });
}

export async function retryWebhookDeliveryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return endpointAction(formData, async (deliveryId) => {
    if (!(await repos.webhooks.requeue(deliveryId, new Date()))) return fail("That delivery was already delivered or no longer exists.");
    const [result] = await deliverByIds([deliveryId]);
    revalidatePath(WEBHOOKS_PATH);
    return result?.ok ? done(`Delivered (HTTP ${result.status}).`) : fail(`Retry failed: ${result?.error ?? "not sent"}.`);
  });
}
