import { kv } from "@/lib/cache/redis";

import { validateSetting, type SettingKey, type SettingValueOf } from "./schema";

// KV mirror of the settings the proxy needs without a database (maintenance,
// the IP allowlist). Kept apart from ./service so proxy.ts never bundles
// Prisma, the audit writer or the auth layer.
//
// Reads are memoized per process, stale-while-revalidate: within FRESH_MS a
// read is free; after that the last known value is returned at once and one
// background KV read refreshes it, so no request waits on a KV round trip
// (hundreds of ms far from the Upstash region) just because the memo aged.
// A value older than MAX_STALE_MS is never served: that read waits for KV.
// So a change made on another instance takes effect within FRESH_MS plus one
// request, and never later than MAX_STALE_MS; a save on this instance forgets
// the memo at once.

export const KV_MIRRORED_SETTINGS = ["maintenance", "security.ipAllowlist"] as const satisfies readonly SettingKey[];
export type KvMirroredSetting = (typeof KV_MIRRORED_SETTINGS)[number];

const FRESH_MS = 5_000;
const MAX_STALE_MS = 60_000;

type Entry = {
  /** When `value` was requested. */
  at: number;
  value: Promise<unknown>;
  /** The last value that finished loading, and when it was requested. */
  settled?: { at: number; value: unknown };
};

// On globalThis so the proxy bundle and the app bundle share one memo in dev
// and on a single Node server.
const store = globalThis as unknown as { appKvSettingMemo?: Map<string, Entry> };
const memo = (store.appKvSettingMemo ??= new Map<string, Entry>());

export const kvSettingKey = (key: SettingKey) => `setting:${key}`;

async function load<K extends KvMirroredSetting>(key: K): Promise<SettingValueOf<K> | null> {
  try {
    const raw = await kv.get(kvSettingKey(key));
    if (raw === null || raw === undefined) return null;
    return validateSetting(key, raw);
  } catch {
    // A KV outage or a corrupt value reads as "not set"; the caller applies its safe default.
    return null;
  }
}

/** Starts one KV read for `key` and records its result as the newest settled value. */
function refresh(key: KvMirroredSetting, now: number, previous?: Entry): Promise<unknown> {
  const entry: Entry = { at: now, value: load(key), settled: previous?.settled };
  memo.set(key, entry);
  void entry.value.then((value) => {
    // A save on this instance may have replaced the entry meanwhile; never overwrite it.
    if (memo.get(key) === entry) entry.settled = { at: now, value };
  });
  return entry.value;
}

/** KV-only read with no database fallback: null means "not set", and the caller decides the default. */
export function readKvSetting<K extends KvMirroredSetting>(key: K, now = Date.now()): Promise<SettingValueOf<K> | null> {
  const hit = memo.get(key);
  // Aged (or never read): start one KV read; later callers share it.
  const entry = !hit || now - hit.at >= FRESH_MS ? (refresh(key, now, hit), memo.get(key)!) : hit;

  const settled = entry.settled;
  // The newest read already finished, or an older value is still young enough to serve meanwhile.
  if (settled && (settled.at === entry.at || now - settled.at < MAX_STALE_MS)) {
    return Promise.resolve(settled.value as SettingValueOf<K> | null);
  }
  return entry.value as Promise<SettingValueOf<K> | null>;
}

/** Writes the mirror with no expiry: an expired key would silently turn maintenance or the allowlist off. */
export async function writeKvSetting<K extends KvMirroredSetting>(key: K, value: SettingValueOf<K>): Promise<void> {
  memo.delete(key);
  await kv.set(kvSettingKey(key), value);
}

export function isKvMirrored(key: SettingKey): key is KvMirroredSetting {
  return (KV_MIRRORED_SETTINGS as readonly string[]).includes(key);
}
