import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { EncryptionKey, RetentionPolicy } from "./config";

// The on-bucket format of a backup, and the pure rules around it: ids,
// encryption, the manifest and retention. No I/O here.
//
// Layout under <prefix>/<id>/:
//   <table>.ndjson.gz.enc  one per table: one row_to_json() line per row,
//                          gzipped, then sealed with AES-256-GCM
//   manifest.json          written LAST, so a backup without one never
//                          finished and is never listed or restored
//
// The manifest is plain JSON: it holds table names, column types, row counts
// and checksums, never row data, so backups can be listed without the key.

export const FORMAT = "sahan-backup";
export const FORMAT_VERSION = 1;
export const MANIFEST_FILE = "manifest.json";

/** A backup id: its UTC start time, sortable as text, plus 6 hex against collisions. */
const ID_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-[0-9a-f]{6}$/;

export function newBackupId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

export function isBackupId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/** When the backup started; null for anything that is not a backup id. */
export function backupIdDate(id: string): Date | null {
  const match = ID_PATTERN.exec(id);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
}

export const tableObjectName = (table: string) => `${table}.ndjson.gz.enc`;

export interface ManifestTable {
  name: string;
  /** Object name under the backup's folder. */
  object: string;
  rows: number;
  /** Size of the stored (sealed) object. */
  bytes: number;
  /** SHA-256 hex of the gzipped NDJSON before sealing. */
  sha256: string;
  /** [column, type] in table order, as format_type() names them. */
  columns: [string, string][];
}

export interface Manifest {
  format: typeof FORMAT;
  version: typeof FORMAT_VERSION;
  id: string;
  createdAt: string;
  finishedAt: string;
  schema: string;
  /** server_version of the source database. */
  postgres: string;
  /** Which BACKUP_ENCRYPTION_KEY sealed the tables (config.ts EncryptionKey.id). */
  keyId: string;
  tables: ManifestTable[];
  excluded: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The manifest when `value` is a well-formed one of this format; null otherwise. */
export function parseManifest(value: unknown): Manifest | null {
  if (!isRecord(value) || value.format !== FORMAT || value.version !== FORMAT_VERSION) return null;
  if (typeof value.id !== "string" || !isBackupId(value.id)) return null;
  if (typeof value.schema !== "string" || typeof value.keyId !== "string" || !Array.isArray(value.tables)) return null;
  const tablesOk = value.tables.every(
    (table) =>
      isRecord(table) &&
      typeof table.name === "string" &&
      /^[a-z_][a-z0-9_]{0,62}$/.test(table.name) &&
      table.object === tableObjectName(table.name) &&
      Number.isInteger(table.rows) &&
      typeof table.sha256 === "string" &&
      Array.isArray(table.columns)
  );
  return tablesOk ? (value as unknown as Manifest) : null;
}

// --- Encryption -------------------------------------------------------------
// SBK1 | iv (12) | tag (16) | ciphertext. The additional data binds each
// object to its backup and table, so an object copied into another backup's
// folder, or renamed to another table, fails authentication on restore.

const MAGIC = Buffer.from("SBK1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

const aad = (backupId: string, table: string) => Buffer.concat([MAGIC, Buffer.from(`${backupId}/${table}`)]);

export function seal(plain: Buffer, key: EncryptionKey, backupId: string, table: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key.bytes, iv);
  cipher.setAAD(aad(backupId, table));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

/** Opens a sealed object. Throws when it was not sealed with `key` for this backup and table. */
export function unseal(sealed: Buffer, key: EncryptionKey, backupId: string, table: string): Buffer {
  if (sealed.length < MAGIC.length + IV_BYTES + TAG_BYTES || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error(`${table}: not a sealed backup object`);
  }
  const iv = sealed.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = sealed.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key.bytes, iv);
  decipher.setAAD(aad(backupId, table));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(sealed.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)), decipher.final()]);
  } catch {
    throw new Error(`${table}: the object failed authentication (wrong key, or it was changed or moved)`);
  }
}

// --- Retention ----------------------------------------------------------------

/** ISO-8601 week, e.g. "2026-W42", in UTC. */
export function isoWeek(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Backups to delete under `policy` (grandfather-father-son): keep the newest
 * `daily`, plus the newest of each of the latest `weekly` ISO weeks and
 * `monthly` calendar months that have a backup. Never returns the newest
 * backup. Ids that are not backup ids are left alone.
 */
export function expiredBackups(ids: readonly string[], policy: RetentionPolicy): string[] {
  const dated = ids
    .map((id) => ({ id, date: backupIdDate(id) }))
    .filter((entry): entry is { id: string; date: Date } => entry.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime() || (a.id < b.id ? 1 : -1));
  const keep = new Set(dated.slice(0, Math.max(1, policy.daily)).map((entry) => entry.id));
  const keepNewestPer = (bucketOf: (date: Date) => string, limit: number) => {
    const seen = new Set<string>();
    for (const entry of dated) {
      const bucket = bucketOf(entry.date);
      if (seen.has(bucket)) continue;
      if (seen.size >= limit) break;
      seen.add(bucket);
      keep.add(entry.id);
    }
  };
  keepNewestPer(isoWeek, policy.weekly);
  keepNewestPer((date) => date.toISOString().slice(0, 7), policy.monthly);
  return dated.filter((entry) => !keep.has(entry.id)).map((entry) => entry.id);
}
