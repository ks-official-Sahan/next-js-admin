import { createHash } from "node:crypto";

import type { BucketAccount } from "@sahan-sac/media-kit/accounts";

// Backup settings, read from the environment by the caller and passed in
// (never read here), so every function below is testable without secrets.
// Backups go to an S3-compatible bucket kept for nothing else (Neon Object
// Storage, R2 or S3), encrypted with a key the bucket never sees.

type Env = Record<string, string | undefined>;

export interface RetentionPolicy {
  /** The newest backups kept, whatever their age. */
  daily: number;
  /** One backup kept per ISO week, for this many weeks. */
  weekly: number;
  /** One backup kept per calendar month, for this many months. */
  monthly: number;
}

export interface EncryptionKey {
  /** First 16 hex of the key's SHA-256: names the key in a manifest without revealing it. */
  id: string;
  bytes: Buffer;
}

export interface BackupConfig {
  account: BucketAccount;
  /** Key prefix for every object, no leading or trailing slash. */
  prefix: string;
  /** Postgres schema backed up. */
  schema: string;
  /** Tables never written to a backup (sessions, one-time tokens). */
  excludeTables: string[];
  key: EncryptionKey;
  /** Older keys, tried when restoring a backup made before a key rotation. */
  previousKeys: EncryptionKey[];
  retention: RetentionPolicy;
}

/**
 * Short-lived or useless-after-restore rows: restoring a session or a
 * one-time token would only resurrect something already expired or used.
 */
export const DEFAULT_EXCLUDED_TABLES = ["user_sessions", "mfa_challenges", "auth_tokens"] as const;

export const DEFAULT_RETENTION: RetentionPolicy = { daily: 14, weekly: 8, monthly: 6 };

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

/** A 32-byte key from 64 hex characters or base64; null when it is neither. */
export function parseEncryptionKey(raw: string | undefined): EncryptionKey | null {
  const value = raw?.trim();
  if (!value) return null;
  const bytes = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (bytes.length !== 32) return null;
  return { id: createHash("sha256").update(bytes).digest("hex").slice(0, 16), bytes };
}

function count(raw: string | undefined, fallback: number, max: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(value) && value >= 0 ? Math.min(value, max) : fallback;
}

export type BackupConfigResult = { ok: true; config: BackupConfig } | { ok: false; problems: string[]; configured: boolean };

/**
 * Backup settings from `env`. `configured` is false when no BACKUP_S3_*
 * variable is set at all (backups simply off), true when some are set but
 * something is missing or invalid (shown on /admin/backups).
 */
export function backupConfigFromEnv(env: Env, schema: string): BackupConfigResult {
  const endpoint = env.BACKUP_S3_ENDPOINT?.trim().replace(/\/+$/, "");
  const bucket = env.BACKUP_S3_BUCKET?.trim();
  const accessKeyId = env.BACKUP_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.BACKUP_S3_SECRET_ACCESS_KEY?.trim();
  const configured = Boolean(endpoint || bucket || accessKeyId || secretAccessKey);
  const problems: string[] = [];

  if (!endpoint) problems.push("BACKUP_S3_ENDPOINT is not set");
  else if (!endpoint.startsWith("https://")) problems.push("BACKUP_S3_ENDPOINT must be an https URL");
  if (!bucket) problems.push("BACKUP_S3_BUCKET is not set");
  if (!accessKeyId) problems.push("BACKUP_S3_ACCESS_KEY_ID is not set");
  if (!secretAccessKey) problems.push("BACKUP_S3_SECRET_ACCESS_KEY is not set");
  const key = parseEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
  if (!key) problems.push("BACKUP_ENCRYPTION_KEY must be 32 bytes, as 64 hex characters or base64 (openssl rand -base64 32)");
  const previousKeys = (env.BACKUP_ENCRYPTION_KEY_PREVIOUS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseEncryptionKey);
  if (previousKeys.some((each) => each === null)) problems.push("BACKUP_ENCRYPTION_KEY_PREVIOUS has a key that is not 32 bytes");

  const prefix = (env.BACKUP_S3_PREFIX ?? "db").trim().replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9/_-]{1,100}$/.test(prefix)) problems.push("BACKUP_S3_PREFIX may only use letters, digits, /, _ and -");
  const extra = (env.BACKUP_EXCLUDE_TABLES ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  if (!extra.every((name) => IDENTIFIER.test(name))) problems.push("BACKUP_EXCLUDE_TABLES must be a comma-separated list of table names");

  if (problems.length > 0) return { ok: false, problems, configured };
  return {
    ok: true,
    config: {
      account: {
        id: "backup",
        provider: "s3",
        slot: 0,
        capBytes: null,
        readOnly: false,
        endpoint: endpoint!,
        region: env.BACKUP_S3_REGION?.trim() || "us-east-1",
        bucket: bucket!,
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
        publicUrl: `${endpoint}/${bucket}`,
      },
      prefix,
      schema,
      excludeTables: [...new Set([...DEFAULT_EXCLUDED_TABLES, ...extra])],
      key: key!,
      previousKeys: previousKeys as EncryptionKey[],
      retention: {
        daily: Math.max(1, count(env.BACKUP_RETENTION_DAILY, DEFAULT_RETENTION.daily, 365)),
        weekly: count(env.BACKUP_RETENTION_WEEKLY, DEFAULT_RETENTION.weekly, 260),
        monthly: count(env.BACKUP_RETENTION_MONTHLY, DEFAULT_RETENTION.monthly, 120),
      },
    },
  };
}
