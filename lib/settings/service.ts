import "server-only";

import { cached } from "@/lib/cache/cached";
import { invalidate } from "@/lib/cache/invalidate";
import { forSettings } from "@/lib/cache/plan";
import { staticTags } from "@/lib/cache/tags";
import { db } from "@/lib/db/prisma";
import { audit } from "@/lib/admin/audit";
import type { AuthUser } from "@/lib/auth/dal";
import { log } from "@/lib/log";
import {
  DEFAULT_SETTINGS,
  getSettingDefault,
  getSettingSchema,
  isPublicSetting,
  isSettingKey,
  type SettingKey,
  type SettingValueOf,
  validateSetting,
} from "./schema";
import { isKvMirrored, KV_MIRRORED_SETTINGS, writeKvSetting } from "./kv";

// Service layer for settings: read, write, cache and validate. Design:
// design notes, section 16. Settings are stored in the database
// with Prisma, cached with unstable_cache and tags, and mirrored to KV so the
// proxy (which does no database work) can read maintenance and the IP
// allowlist. The KV mirror is written on every save; before the first save it
// simply has no value, and getKvSetting then returns null, which every reader
// (the proxy included) treats as the safe default: NOT in maintenance, and an
// empty allowlist (fail-open).

type SettingValue<K extends SettingKey> = SettingValueOf<K>;

/**
 * Read one setting, falling back to its default when not stored or invalid.
 * Not cached; use getSetting/getPublicSettings/getAllSettings for cached reads.
 */
async function readSettingRaw<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  if (!isSettingKey(key)) return getSettingDefault(key) as SettingValue<K>;

  try {
    const row = await db.setting.findUnique({ where: { key } });
    if (!row) return getSettingDefault(key) as SettingValue<K>;
    return validateSetting(key, row.value) as SettingValue<K>;
  } catch (err) {
    log.error("Failed to read setting", { key, error: String(err) });
    return getSettingDefault(key) as SettingValue<K>;
  }
}

/** One cached setting. Use in request handlers and Server Components. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const fn = async () => readSettingRaw(key);
  return cached(fn, [`setting:${key}`], { tags: ["settings", `settings:${key}`] })();
}

/**
 * The subset safe to expose to layouts that feed client code, and to cache
 * broadly. Never includes a key outside publicSettingKeys, even if a caller
 * adds a new key to DEFAULT_SETTINGS and forgets to classify it
 * (isPublicSetting is the single source of truth). Exported uncached so it
 * can be unit tested without going through unstable_cache.
 */
export async function collectPublicSettings(): Promise<Partial<Record<SettingKey, unknown>>> {
  return readSettingsRaw((Object.keys(DEFAULT_SETTINGS) as SettingKey[]).filter(isPublicSetting));
}

/**
 * Several settings in one query (not one round trip per key), each falling
 * back to its default when not stored or invalid, exactly like readSettingRaw.
 */
async function readSettingsRaw(keys: SettingKey[]): Promise<Record<SettingKey, unknown>> {
  let rows: { key: string; value: unknown }[] = [];
  try {
    rows = await db.setting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
  } catch (err) {
    log.error("Failed to read settings", { count: keys.length, error: String(err) });
  }
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const result = {} as Record<SettingKey, unknown>;
  for (const key of keys) {
    try {
      result[key] = stored.has(key) ? validateSetting(key, stored.get(key)) : getSettingDefault(key);
    } catch (err) {
      log.error("Failed to read setting", { key, error: String(err) });
      result[key] = getSettingDefault(key);
    }
  }
  return result;
}

/** Cached entry point for request handlers and Server Components. */
export async function getPublicSettings(): Promise<Partial<Record<SettingKey, unknown>>> {
  return cached(collectPublicSettings, ["settings:public"], { tags: ["settings:public"] })();
}

/** Every setting, for admin screens that hold a permission to see all of them. */
export async function collectAllSettings(): Promise<Record<SettingKey, unknown>> {
  return readSettingsRaw(Object.keys(DEFAULT_SETTINGS) as SettingKey[]);
}

export async function getAllSettings(): Promise<Record<SettingKey, unknown>> {
  return cached(collectAllSettings, ["settings:all"], { tags: ["settings"] })();
}

/**
 * Update a setting and audit the change in the same request. Callers must
 * already hold `manageSettings` (checked by lib/actions/settings.ts, never
 * here) — this function assumes the caller is authorized and only needs the
 * actor for the audit row and the `updatedById` column.
 */
export async function updateSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
  actor: Pick<AuthUser, "id" | "email">
): Promise<void> {
  const schema = getSettingSchema(key);
  const validated = schema.parse(value) as SettingValue<K>;
  const before = await readSettingRaw(key);

  try {
    await db.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key },
        create: { key, value: validated, updatedById: actor.id },
        update: { value: validated, updatedById: actor.id },
      });

      await audit(
        {
          action: "settings.updated",
          actor: { id: actor.id, email: actor.email },
          entityType: "Setting",
          entityId: key,
          before,
          after: validated,
        },
        tx
      );
    });
  } catch (err) {
    log.error("Failed to update setting", { key, error: String(err) });
    throw err;
  }

  // KV mirror and cache invalidation run after the commit. A mirror failure
  // is logged inside mirrorSettingToKv and never turns a successful save into
  // a reported failure (see the module docstring above).
  await mirrorSettingToKv(key, validated);

  const plan = forSettings();
  invalidate({ tags: [...new Set([`settings:${key}`, "settings", ...plan.tags])], paths: plan.paths });
}

/**
 * Mirror a setting value to KV. Only the keys the proxy reads without a
 * database (maintenance, the IP allowlist) are mirrored; every other key is
 * read from Postgres through the cached getSetting/getAllSettings.
 */
async function mirrorSettingToKv<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void> {
  if (!isKvMirrored(key)) return;
  try {
    await writeKvSetting(key, value as SettingValueOf<typeof key>);
  } catch (err) {
    // KV failure is not fatal for the setting save; the proxy's safe default
    // applies until the mirror catches up (documented at the top of this file).
    log.warn("Failed to mirror setting to KV", { key, error: String(err) });
  }
}

/**
 * Re-mirror the KV-read settings from the database. Used by the "clear
 * cache" action to repair any drift between Postgres and KV (for example
 * after a KV outage during a save), and available for a manual resync.
 */
export async function syncSettingsToKv(): Promise<void> {
  await Promise.all(
    KV_MIRRORED_SETTINGS.map(async (key) => {
      try {
        await writeKvSetting(key, await readSettingRaw(key));
      } catch (err) {
        log.error("Failed to sync setting to KV", { key, error: String(err) });
      }
    })
  );
}

/** Invalidate every cache tag and repair the KV mirror. Backs the "clear cache" button. */
export async function clearAllCaches(): Promise<void> {
  invalidate({ tags: staticTags(), paths: [{ path: "/", type: "layout" }] });
  await syncSettingsToKv();
}
