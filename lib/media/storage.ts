import "server-only";

import { storageAccountsFromEnv, type AccountRegistry, type BucketAccount, type CloudinaryAccount, type StorageAccount } from "@sahan-sac/media-kit/accounts";
import { CloudinaryClient } from "@sahan-sac/media-kit/cloudinary";
import { uploadCandidates } from "@sahan-sac/media-kit/storage";

import { kv } from "@/lib/cache/redis";
import { repos } from "@/lib/data";
import type { MediaProvider } from "@/lib/data/media";
import { log } from "@/lib/log";

// The app's view of its storage accounts (media-kit/accounts): read once per
// server instance from the environment, with one CloudinaryClient per
// Cloudinary account. Two pieces of shared state choose where a new upload
// goes, both cheap to read on every upload:
// - full marks: one KV key holding { accountId: expiresAt }, set when an
//   account answers "full" so the next uploads skip it for a while;
// - recorded usage: one grouped sum of stored sizes per account, cached
//   briefly, checked against each account's soft cap.

const FULL_KEY = "media:full";
const USAGE_TTL_MS = 5 * 60_000;

/** How long a "full" answer keeps an account out of new uploads. */
function fullTtlMs(): number {
  const seconds = Number(process.env.MEDIA_FULL_TTL_S);
  return Number.isFinite(seconds) && seconds >= 60 ? seconds * 1000 : 6 * 3_600_000;
}

let registry: AccountRegistry | null = null;
const clients = new Map<string, CloudinaryClient>();

/** Every configured account in priority order, plus what was wrong with the env. */
export function mediaStorage(): AccountRegistry {
  if (!registry) {
    registry = storageAccountsFromEnv(process.env);
    for (const problem of registry.problems) log.warn("media storage env", { problem });
  }
  return registry;
}

export function findAccount(id: string): StorageAccount | null {
  return mediaStorage().accounts.find((account) => account.id === id) ?? null;
}

export function cloudinaryFor(account: CloudinaryAccount): CloudinaryClient {
  let client = clients.get(account.id);
  if (!client) {
    client = new CloudinaryClient({
      cloudName: account.cloudName,
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
      onWarn: (message, meta) => log.warn(message, { ...(meta ?? {}), accountId: account.id }),
    });
    clients.set(account.id, client);
  }
  return client;
}

export function isBucket(account: StorageAccount): account is BucketAccount {
  return account.provider !== "cloudinary";
}

/** The MediaAsset provider value for an account. */
export function providerOf(account: StorageAccount): MediaProvider {
  return account.provider === "cloudinary" ? "CLOUDINARY" : account.provider === "s3" ? "S3" : "R2";
}

async function readFull(): Promise<Record<string, number>> {
  const marks = await kv.get<Record<string, number>>(FULL_KEY).catch(() => null);
  return marks && typeof marks === "object" ? marks : {};
}

/** Account ids currently marked full. */
export async function fullAccounts(now = Date.now()): Promise<Set<string>> {
  const marks = await readFull();
  return new Set(Object.entries(marks).flatMap(([id, until]) => (typeof until === "number" && until > now ? [id] : [])));
}

/** Keeps `account` out of new uploads for MEDIA_FULL_TTL_S (default 6 h). */
export async function markFull(account: StorageAccount, now = Date.now()): Promise<void> {
  const ttl = fullTtlMs();
  const live = Object.fromEntries(Object.entries(await readFull()).filter(([, until]) => typeof until === "number" && until > now));
  live[account.id] = now + ttl;
  await kv.set(FULL_KEY, live, { ttlSeconds: Math.ceil(ttl / 1000) }).catch(() => {});
  log.warn("media account marked full", { accountId: account.id, hours: Math.round(ttl / 3_600_000) });
}

let usage: { at: number; value: Promise<Map<string, number>> } | null = null;

/** Bytes recorded per account; one grouped query, shared for USAGE_TTL_MS. */
export function usedBytes(now = Date.now()): Promise<Map<string, number>> {
  if (!usage || now - usage.at > USAGE_TTL_MS) {
    const value = repos.media.bytesByAccount().then((sums) => new Map(Object.entries(sums)));
    usage = { at: now, value };
    // A failed read is not kept: the next upload asks again.
    value.catch(() => {
      if (usage?.value === value) usage = null;
    });
  }
  return usage.value;
}

/** Drops the cached usage so the next pick sees an upload or delete at once. */
export function forgetUsage(): void {
  usage = null;
}

/**
 * Where a new file of `sizeBytes` may go, best first. The usage query runs
 * only when some account has a soft cap.
 */
export async function candidatesFor(sizeBytes: number, skip: readonly string[] = []): Promise<StorageAccount[]> {
  const { accounts } = mediaStorage();
  const capped = accounts.some((account) => account.capBytes !== null);
  const [full, used] = await Promise.all([fullAccounts(), capped ? usedBytes().catch(() => new Map<string, number>()) : new Map<string, number>()]);
  return uploadCandidates(accounts, sizeBytes, { full, usedBytes: used, skip: new Set(skip) });
}
