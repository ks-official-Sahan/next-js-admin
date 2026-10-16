import "server-only";

import { cached } from "@/lib/cache/cached";
import { invalidate } from "@/lib/cache/invalidate";
import { forSettings } from "@/lib/cache/plan";
import { staticTags, TAGS } from "@/lib/cache/tags";
import { repos, withTx } from "@/lib/data";
import { audit } from "@/lib/admin/audit";
import type { AuthUser } from "@/lib/auth/dal";
import { errorText, log } from "@/lib/log";
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
// with Prisma, cached with cached() ("use cache" plus tags), and mirrored to KV so the
// proxy (which does no database work) can read maintenance and the IP
// allowlist. The KV mirror is written on every save; before the first save it
// simply has no value, and getKvSetting then returns null, which every reader
// (the proxy included) treats as the safe default: NOT in maintenance, and an
// empty allowlist (fail-open).

type SettingValue<K extends SettingKey> = SettingValueOf<K>;

const PUBLIC_KEYS = (Object.keys(DEFAULT_SETTINGS) as SettingKey[]).filter(isPublicSetting);
const ALL_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];

// Two kinds of read. The "stored" readers throw when the database fails and
// are the only ones wrapped in cached(): a default is never written into the
// cache, so one database blip cannot pin defaults site-wide for the cache
// lifetime (lib/cache/cached.ts: "never put a code-default fallback inside
// fn"). A stored value that fails validation still reads as its default; that
// is the data's state, not an outage, so caching it is correct. The callers
// below apply the default on error, outside the cache.

/** The stored value or its default when not stored or invalid. Throws when the database fails. */
async function readStoredSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  if (!isSettingKey(key)) return getSettingDefault(key) as SettingValue<K>;
  const row = await repos.settings.find(key);
  return (row ? validOrDefault(key, row.value) : getSettingDefault(key)) as SettingValue<K>;
}

function validOrDefault(key: SettingKey, value: unknown): unknown {
  try {
    return validateSetting(key, value);
  } catch (err) {
    log.error("Stored setting is invalid, using its default", { key, error: String(err) });
    return getSettingDefault(key);
  }
}

function defaultsFor(keys: SettingKey[]): Record<SettingKey, unknown> {
  const result = {} as Record<SettingKey, unknown>;
  for (const key of keys) result[key] = getSettingDefault(key);
  return result;
}

/** Runs `read`; when it throws, logs and answers `fallback()` (never cached). */
async function orDefault<T>(read: () => Promise<T>, fallback: () => T, context: Record<string, unknown>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    log.error("Failed to read settings, using defaults", { ...context, error: errorText(err) });
    return fallback();
  }
}

/** Read one setting, falling back to its default when not stored, invalid or unreadable. Not cached. */
async function readSettingRaw<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  return orDefault(() => readStoredSetting(key), () => getSettingDefault(key) as SettingValue<K>, { key });
}

/** One cached setting. Use in request handlers and Server Components. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const read = cached(() => readStoredSetting(key), [`setting:${key}`], { tags: [TAGS.settings, `settings:${key}`] });
  return orDefault(read, () => getSettingDefault(key) as SettingValue<K>, { key });
}

/**
 * The subset safe to expose to layouts that feed client code, and to cache
 * broadly. Never includes a key outside publicSettingKeys, even if a caller
 * adds a new key to DEFAULT_SETTINGS and forgets to classify it
 * (isPublicSetting is the single source of truth). Exported uncached so it
 * can be unit tested without going through cached().
 */
export async function collectPublicSettings(): Promise<Partial<Record<SettingKey, unknown>>> {
  return readSettingsRaw(PUBLIC_KEYS);
}

/**
 * Several settings in one query (not one round trip per key), each its stored
 * value or its default when not stored or invalid. Throws when the database fails.
 */
async function readStoredSettings(keys: SettingKey[]): Promise<Record<SettingKey, unknown>> {
  const rows = await repos.settings.findMany(keys);
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const result = {} as Record<SettingKey, unknown>;
  for (const key of keys) result[key] = stored.has(key) ? validOrDefault(key, stored.get(key)) : getSettingDefault(key);
  return result;
}

/** readStoredSettings, with every default when the database fails. Not cached. */
async function readSettingsRaw(keys: SettingKey[]): Promise<Record<SettingKey, unknown>> {
  return orDefault(() => readStoredSettings(keys), () => defaultsFor(keys), { count: keys.length });
}

/** Cached entry point for request handlers and Server Components. */
export async function getPublicSettings(): Promise<Partial<Record<SettingKey, unknown>>> {
  const read = cached(() => readStoredSettings(PUBLIC_KEYS), ["settings:public"], { tags: ["settings:public"] });
  return orDefault(read, () => defaultsFor(PUBLIC_KEYS), { count: PUBLIC_KEYS.length });
}

/** Every setting, for admin screens that hold a permission to see all of them. */
export async function collectAllSettings(): Promise<Record<SettingKey, unknown>> {
  return readSettingsRaw(ALL_KEYS);
}

export async function getAllSettings(): Promise<Record<SettingKey, unknown>> {
  const read = cached(() => readStoredSettings(ALL_KEYS), ["settings:all"], { tags: [TAGS.settings] });
  return orDefault(read, () => defaultsFor(ALL_KEYS), { count: ALL_KEYS.length });
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
  actor: Pick<AuthUser, "id" | "email"> & Partial<Pick<AuthUser, "role">>
): Promise<void> {
  const schema = getSettingSchema(key);
  const validated = schema.parse(value) as SettingValue<K>;
  const before = await readSettingRaw(key);

  try {
    await withTx(async (tx) => {
      await tx.settings.upsert(key, validated, actor.id);

      await audit(
        {
          action: "settings.updated",
          actor: { id: actor.id, email: actor.email, role: actor.role },
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
  await invalidate({ tags: [...new Set([`settings:${key}`, TAGS.settings, ...plan.tags])], paths: plan.paths });
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
  await invalidate({ tags: staticTags(), paths: [{ path: "/", type: "layout" }] });
  await syncSettingsToKv();
}
