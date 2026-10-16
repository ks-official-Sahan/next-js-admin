import "server-only";

import { randomUUID } from "node:crypto";

import { getRedis, kv, REDIS_PREFIX } from "@/lib/cache/redis";
import { runtimeSchema } from "@/lib/db/url";
import { log } from "@/lib/log";

import { type BackupConfig, backupConfigFromEnv, type BackupConfigResult } from "./config";
import { exportBackup } from "./export";
import { expiredBackups, MANIFEST_FILE } from "./format";
import { backupDb } from "@/lib/data";
import { deleteStoredBackups, listStoredBackups, objectKey, writeObject } from "./store";

// One backup run: lock, export, store the manifest, prune by retention,
// record the outcome. Called by the daily cron (app/api/cron/backup), the
// "Back up now" action (/admin/backups) and the CLI (scripts/backup.ts).

const LOCK_KEY = "backup:lock";
const STATUS_KEY = "backup:last";
/**
 * Short, because a release can be lost (a crash, or the KV falling back to
 * memory after one slow Redis reply) and the lock then simply expires. A
 * live run renews it every two minutes, so a long run never outlives it.
 */
const LOCK_SECONDS = 6 * 60;
const STATUS_SECONDS = 90 * 24 * 60 * 60;
/** An unfinished backup older than this is a crashed run's leftovers. */
const STALE_INCOMPLETE_MS = 24 * 60 * 60 * 1000;
export const NOT_CONFIGURED = "Backups are not configured";

export type BackupTrigger = "cron" | "manual" | "cli";

export interface BackupStatus {
  ok: boolean;
  trigger: BackupTrigger;
  at: string;
  durationMs: number;
  id?: string;
  tables?: number;
  rows?: number;
  bytes?: number;
  pruned?: number;
  error?: string;
}

/**
 * The lock and the last status go straight to Redis when it is configured.
 * The shared kv falls back to memory for 30 s after one slow reply (1.5 s),
 * and a lock released or a status written there is invisible to the next run
 * (a stuck "Another backup is already running"). Memory only when Redis is off.
 */
const RELEASE_IF_OWNER = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
const RENEW_IF_OWNER = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], tonumber(ARGV[2])) else return 0 end';
/** How often a running backup renews its lock: well inside LOCK_SECONDS. */
const RENEW_EVERY_MS = (LOCK_SECONDS / 3) * 1000;

const state = {
  async acquire(token: string): Promise<boolean> {
    const redis = getRedis();
    if (!redis) return kv.set(LOCK_KEY, token, { nx: true, ttlSeconds: LOCK_SECONDS });
    return (await redis.set(REDIS_PREFIX + LOCK_KEY, token, { nx: true, ex: LOCK_SECONDS })) !== null;
  },
  /** Deletes the lock only while it is still this run's (one atomic step on Redis). */
  async release(token: string): Promise<void> {
    const redis = getRedis();
    if (!redis) {
      if ((await kv.get<string>(LOCK_KEY)) === token) await kv.del(LOCK_KEY);
      return;
    }
    await redis.eval(RELEASE_IF_OWNER, [REDIS_PREFIX + LOCK_KEY], [token]);
  },
  /** Pushes the lock's expiry out again while this run still owns it. */
  async renew(token: string): Promise<void> {
    const redis = getRedis();
    if (!redis) {
      if ((await kv.get<string>(LOCK_KEY)) === token) await kv.expire(LOCK_KEY, LOCK_SECONDS);
      return;
    }
    await redis.eval(RENEW_IF_OWNER, [REDIS_PREFIX + LOCK_KEY], [token, String(LOCK_SECONDS)]);
  },
  async save(status: BackupStatus): Promise<void> {
    const redis = getRedis();
    if (!redis) await kv.set(STATUS_KEY, status, { ttlSeconds: STATUS_SECONDS });
    else await redis.set(REDIS_PREFIX + STATUS_KEY, status, { ex: STATUS_SECONDS });
  },
  async read(): Promise<BackupStatus | null> {
    const redis = getRedis();
    return redis ? redis.get<BackupStatus>(REDIS_PREFIX + STATUS_KEY) : kv.get<BackupStatus>(STATUS_KEY);
  },
};

export function currentBackupConfig(env: Record<string, string | undefined> = process.env): BackupConfigResult {
  return backupConfigFromEnv(env, runtimeSchema(env));
}

export async function lastBackupStatus(): Promise<BackupStatus | null> {
  return state.read().catch(() => null);
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runBackup(trigger: BackupTrigger, options: { timeoutMs?: number } = {}): Promise<BackupStatus> {
  const started = Date.now();
  const at = new Date(started).toISOString();
  const resolved = currentBackupConfig();
  if (!resolved.ok) return { ok: false, trigger, at, durationMs: 0, error: `${NOT_CONFIGURED}: ${resolved.problems.join("; ")}` };
  const { config } = resolved;

  const token = randomUUID();
  // Redis down: run anyway. A rare overlap costs a duplicate backup, never data.
  const locked = await state.acquire(token).catch(() => true);
  if (!locked) return { ok: false, trigger, at, durationMs: 0, error: "Another backup is already running." };

  // Renewed while the run is alive, so the lock never expires under a slow
  // run; a crashed process stops renewing and the lock expires by itself.
  const renewal = setInterval(() => {
    state.renew(token).catch((error) => log.warn("backup lock renewal failed", { error: message(error) }));
  }, RENEW_EVERY_MS);
  renewal.unref?.();

  let status: BackupStatus;
  try {
    const manifest = await exportBackup(backupDb, config, {
      timeoutMs: options.timeoutMs,
      put: (backupId, name, body, contentType) => writeObject(config.account, objectKey(config.prefix, backupId, name), body, contentType),
    });
    await writeObject(config.account, objectKey(config.prefix, manifest.id, MANIFEST_FILE), Buffer.from(JSON.stringify(manifest, null, 2)), "application/json");
    const pruned = await prune(config).catch((error) => {
      log.warn("backup prune failed", { error: message(error) });
      return 0;
    });
    status = {
      ok: true,
      trigger,
      at,
      durationMs: 0,
      id: manifest.id,
      tables: manifest.tables.length,
      rows: manifest.tables.reduce((sum, table) => sum + table.rows, 0),
      bytes: manifest.tables.reduce((sum, table) => sum + table.bytes, 0),
      pruned,
    };
  } catch (error) {
    log.error("backup failed", { trigger, error: message(error) });
    status = { ok: false, trigger, at, durationMs: 0, error: message(error) };
  } finally {
    clearInterval(renewal);
    await state.release(token).catch((error) => log.warn("backup lock release failed; it expires by itself", { error: message(error) }));
  }
  status.durationMs = Date.now() - started;
  await state.save(status).catch((error) => log.warn("backup status not saved", { error: message(error) }));
  return status;
}

/** Deletes backups past retention and crashed runs' leftovers. Returns how many backups went. */
async function prune(config: BackupConfig): Promise<number> {
  const stored = await listStoredBackups(config.account, config.prefix);
  const expired = new Set(expiredBackups(stored.filter((backup) => backup.complete).map((backup) => backup.id), config.retention));
  const cutoff = Date.now() - STALE_INCOMPLETE_MS;
  const doomed = stored.filter((backup) => expired.has(backup.id) || (!backup.complete && Date.parse(backup.createdAt) < cutoff));
  if (doomed.length > 0) await deleteStoredBackups(config.account, doomed);
  return doomed.length;
}
