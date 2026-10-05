"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { authorizeAction } from "@/lib/actions/guard";
import { done, fail, fieldErrorsFrom, type ActionState } from "@/lib/actions/state";
import { blogPublishJob, housekeepingPruneJob, sessionCleanupJob } from "@/lib/cron/jobs";
import { auditSafe } from "@/lib/admin/audit";
import { isIpAllowed, isValidAllowlistEntry } from "@/lib/security/allowlist";
import { clientIp, UNKNOWN_IP } from "@/lib/security/ip";
import {
  aiContextSchema,
  chatbotConfigSchema,
  DEFAULT_SETTINGS,
  emailRoutingSchema,
  featuresSchema,
  getSettingSchema,
  ipAllowlistSchema,
  maintenanceSchema,
  type SettingKey,
} from "@/lib/settings/schema";
import { clearAllCaches, getSetting, updateSetting } from "@/lib/settings/service";

// Server actions for the settings screen. Every mutation authorizes first (a
// Server Function is a public endpoint), validates with the setting's own
// zod schema, and lets updateSetting() write the audit row and invalidate
// caches in one place. Design notes, Step 16.

const ADMIN_SETTINGS_PATH = "/admin/settings";

function checkbox(formData: FormData, name: string): boolean {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function textOrUndefined(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function updateFeaturesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("manageSettings");
  if (!authz.ok) return fail(authz.error);

  const parsed = featuresSchema.safeParse({
    chatbotEnabled: checkbox(formData, "chatbotEnabled"),
    readMoreEnabled: checkbox(formData, "readMoreEnabled"),
  });
  if (!parsed.success) return fail("Could not save feature flags.", fieldErrorsFrom(parsed.error.issues));

  await updateSetting("features", parsed.data, authz.user);
  revalidatePath(ADMIN_SETTINGS_PATH);
  return done("Feature flags updated.");
}

export async function updateMaintenanceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("manageSettings");
  if (!authz.ok) return fail(authz.error);

  const estimatedEndTime = textOrUndefined(formData, "estimatedEndTime");
  const parsed = maintenanceSchema.safeParse({
    enabled: checkbox(formData, "enabled"),
    reason: textOrUndefined(formData, "reason") ?? maintenanceSchema.parse({}).reason,
    // The field is a plain datetime-local input; convert to ISO only when set.
    estimatedEndTime: estimatedEndTime ? new Date(estimatedEndTime).toISOString() : undefined,
  });
  if (!parsed.success) return fail("Could not save maintenance mode.", fieldErrorsFrom(parsed.error.issues));

  await updateSetting("maintenance", parsed.data, authz.user);
  // updateSetting() already saved and audited the row transactionally; this
  // is a second, higher-level event, so a failure here must not report the
  // already-successful save as failed.
  await auditSafe({
    action: "maintenance.toggled",
    actor: { id: authz.user.id, email: authz.user.email },
    entityType: "Setting",
    entityId: "maintenance",
    after: { enabled: parsed.data.enabled },
  });
  revalidatePath(ADMIN_SETTINGS_PATH);
  return done(parsed.data.enabled ? "Maintenance mode is on." : "Maintenance mode is off.");
}

/**
 * Saves the admin IP allowlist. Lock-out guard: when the list is being
 * turned on with at least one entry, and the caller's own IP is known (not
 * UNKNOWN_IP — see R22 and proxy.ts), that IP must match the new list, or the
 * save is refused. When the IP cannot be determined at all (no
 * TRUSTED_PROXY_HOPS, or off Vercel), the guard cannot verify anything either
 * way, so it lets the save through with a warning: the proxy itself fails
 * open on an unknown IP (documented in proxy.ts), so an unverifiable save
 * here does not risk a silent full lockout, only a filter that cannot be
 * enforced until TRUSTED_PROXY_HOPS is set.
 */
export async function updateIpAllowlistAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("manageIpAllowlist");
  if (!authz.ok) return fail(authz.error);

  const raw = String(formData.get("ips") ?? "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const invalid = lines.filter((line) => !isValidAllowlistEntry(line));
  if (invalid.length > 0) {
    return fail(`Not a valid IP or CIDR range: ${invalid[0]}`, { ips: `Not a valid IP or CIDR range: ${invalid[0]}` });
  }

  const enabled = checkbox(formData, "enabled");
  const description = textOrUndefined(formData, "description") ?? "";

  const parsed = ipAllowlistSchema.safeParse({ enabled, ips: lines, description });
  if (!parsed.success) return fail("Could not save the IP allowlist.", fieldErrorsFrom(parsed.error.issues));

  if (enabled && lines.length > 0) {
    const callerIp = clientIp(await headers());
    if (callerIp !== UNKNOWN_IP && !isIpAllowed(callerIp, lines)) {
      return fail(
        `Your current IP (${callerIp}) is not in this list. Add it first, or you will be locked out.`,
        { ips: "Your current IP is not in this list." }
      );
    }
  }

  await updateSetting("security.ipAllowlist", parsed.data, authz.user);
  revalidatePath(ADMIN_SETTINGS_PATH);
  return done(enabled ? "IP allowlist is on." : "IP allowlist is off.");
}

export async function updateChatbotConfigAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("manageSettings");
  if (!authz.ok) return fail(authz.error);

  // trainingDataVersion is bumped by the chatbot training screen (step 15),
  // never by this form: carry the stored value forward unchanged.
  const current = await getSetting("chatbot.config");
  const parsed = chatbotConfigSchema.safeParse({
    enabled: checkbox(formData, "enabled"),
    tone: formData.get("tone"),
    greeting: textOrUndefined(formData, "greeting") ?? chatbotConfigSchema.parse({}).greeting,
    trainingDataVersion: current.trainingDataVersion,
  });
  if (!parsed.success) return fail("Could not save the chatbot configuration.", fieldErrorsFrom(parsed.error.issues));

  await updateSetting("chatbot.config", parsed.data, authz.user);
  await auditSafe({
    action: "chatbot.config.updated",
    actor: { id: authz.user.id, email: authz.user.email },
    entityType: "Setting",
    entityId: "chatbot.config",
    after: parsed.data,
  });
  revalidatePath(ADMIN_SETTINGS_PATH);
  return done("Chatbot configuration updated.");
}

export async function updateEmailRoutingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("manageSettings");
  if (!authz.ok) return fail(authz.error);

  const parsed = emailRoutingSchema.safeParse({
    inboxEmail: textOrUndefined(formData, "inboxEmail"),
    notificationEmail: textOrUndefined(formData, "notificationEmail"),
    autoReplyEnabled: checkbox(formData, "autoReplyEnabled"),
    authCopyEnabled: checkbox(formData, "authCopyEnabled"),
  });
  if (!parsed.success) return fail("Could not save email routing.", fieldErrorsFrom(parsed.error.issues));

  await updateSetting("email.routing", parsed.data, authz.user);
  revalidatePath(ADMIN_SETTINGS_PATH);
  return done("Email routing updated.");
}

export async function updateAiContextAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("manageSettings");
  if (!authz.ok) return fail(authz.error);

  const text = (name: string) => String(formData.get(name) ?? "").replace(/\r\n/g, "\n").trim();
  const parsed = aiContextSchema.safeParse({
    global: text("global"),
    blog: text("blog"),
    seo: text("seo"),
    chatbot: text("chatbot"),
  });
  if (!parsed.success) return fail("Could not save the AI context.", fieldErrorsFrom(parsed.error.issues));

  await updateSetting("ai.context", parsed.data, authz.user);
  revalidatePath(ADMIN_SETTINGS_PATH);
  return done("AI context saved. New AI requests use it now.");
}

export async function resetSettingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("manageSettings");
  if (!authz.ok) return fail(authz.error);

  const key = String(formData.get("key") ?? "");
  if (!(key in DEFAULT_SETTINGS)) return fail("Unknown setting key.");

  const settingKey = key as SettingKey;
  const schema = getSettingSchema(settingKey);
  const defaultValue = schema.parse({});

  await updateSetting(settingKey, defaultValue, authz.user);
  revalidatePath(ADMIN_SETTINGS_PATH);
  return done("Reset to defaults.");
}

/** Invalidates every cache tag and repairs the KV mirror. */
export async function clearCacheAction(_previous: ActionState, _formData: FormData): Promise<ActionState> {
  const authz = await authorizeAction("clearSystemCache");
  if (!authz.ok) return fail(authz.error);

  await clearAllCaches();
  await auditSafe({
    action: "cache.cleared",
    actor: { id: authz.user.id, email: authz.user.email },
    entityType: "Setting",
  });
  revalidatePath(ADMIN_SETTINGS_PATH);
  return done("Cache cleared.");
}

const CRON_JOBS = ["blog-publish", "session-cleanup", "audit-prune"] as const;
type CronJobName = (typeof CRON_JOBS)[number];

function isCronJobName(value: string): value is CronJobName {
  return (CRON_JOBS as readonly string[]).includes(value);
}

/**
 * Runs one cron job on demand from the settings screen. blog-publish and
 * session-cleanup need manageCron (MANAGER holds this by default);
 * audit-prune deletes audit rows and needs manageSettings (DEVELOPER only).
 */
export async function runCronJobAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const job = String(formData.get("job") ?? "");
  if (!isCronJobName(job)) return fail("Unknown job.");

  const permission = job === "audit-prune" ? "manageSettings" : "manageCron";
  const authz = await authorizeAction(permission);
  if (!authz.ok) return fail(authz.error);

  const result =
    job === "blog-publish" ? await blogPublishJob() : job === "session-cleanup" ? await sessionCleanupJob() : await housekeepingPruneJob();

  if (result.error) return fail(`${job} failed: ${result.error}`);

  // The job already ran; an audit failure must not report it as failed.
  await auditSafe({
    action: "cron.ran",
    actor: { id: authz.user.id, email: authz.user.email },
    entityType: "CronJob",
    entityId: job,
    meta: { job, result },
  });

  revalidatePath(ADMIN_SETTINGS_PATH);
  const count = "published" in result ? result.published : "deleted" in result ? result.deleted : 0;
  return done(`${job} ran: ${count} row(s) affected.`);
}
