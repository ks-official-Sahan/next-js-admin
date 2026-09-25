import "server-only";

import { unstable_cache } from "next/cache";

import { kv } from "./redis";

// The only file that wraps Next's data cache. `unstable_cache` is documented as
// replaced by `use cache` in Next 16 (design notes, D3, R1), so a
// later move to Cache Components changes this file and nothing else.
//
// A Redis (Upstash, or in-memory when unconfigured) read-through sits in
// front of `unstable_cache`. `unstable_cache` alone re-runs `fn` on every
// request in dev, and on every cold serverless start until its own cache
// warms, which is what made the first request after a restart slow enough to
// show the route's loading.tsx for longer than it should. Redis persists
// across both, so a warm key answers in one round trip instead of hitting
// the database. It is capped to a short TTL and purged by tag on
// `invalidate()` (see below), so it never outlives the data it caches by
// more than that cap even if the purge below is ever missed.

/** Safety net: ISR revalidates at least this often even without a publish. */
export const DEFAULT_REVALIDATE_SECONDS = 3600;

/** Upper bound on how long the Redis read-through layer may serve a value. */
const REDIS_CACHE_CAP_SECONDS = 300;

export function cacheKey(...parts: string[]): string[] {
  return ["app", ...parts];
}

function redisDataKey(keyParts: string[]): string {
  return cacheKey(...keyParts).join(":");
}

function redisTagIndexKey(tag: string): string {
  return `tagindex:${tag}`;
}

/** Best-effort: records that `dataKey` was cached under `tag`, for purging later. */
async function addToTagIndex(tag: string, dataKey: string): Promise<void> {
  const existing = (await kv.get<string[]>(redisTagIndexKey(tag))) ?? [];
  if (existing.includes(dataKey)) return;
  await kv.set(redisTagIndexKey(tag), [...existing, dataKey], {
    ttlSeconds: REDIS_CACHE_CAP_SECONDS * 2,
  });
}

/**
 * Purges every Redis-cached key ever tagged `tag`. Called from
 * `invalidate()` so a publish clears this read-through layer too, not only
 * Next's own tag cache. Best-effort: a failure here just means the short
 * TTL above is the fallback.
 */
export async function purgeRedisTag(tag: string): Promise<void> {
  const indexKey = redisTagIndexKey(tag);
  const keys = (await kv.get<string[]>(indexKey)) ?? [];
  if (keys.length > 0) await kv.del(...keys);
  await kv.del(indexKey);
}

/**
 * Caches an async read under `keyParts`, tagged for on-demand invalidation.
 * Never put a code-default fallback inside `fn`: throw instead and use
 * loadOrNull() outside, so a fallback is never cached.
 */
export function cached<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { tags: string[]; revalidate?: number | false }
): (...args: Args) => Promise<Result> {
  const revalidate = options.revalidate ?? DEFAULT_REVALIDATE_SECONDS;
  const dataKey = redisDataKey(keyParts);
  const redisTtl = revalidate === false ? undefined : Math.min(revalidate, REDIS_CACHE_CAP_SECONDS);

  return unstable_cache(
    async (...args: Args) => {
      if (redisTtl) {
        const hit = await kv.get<Result>(dataKey).catch(() => null);
        if (hit !== null) return hit;
      }

      const result = await fn(...args);

      if (redisTtl) {
        await kv.set(dataKey, result, { ttlSeconds: redisTtl }).catch(() => {});
        await Promise.all(options.tags.map((tag) => addToTagIndex(tag, dataKey).catch(() => {})));
      }

      return result;
    },
    cacheKey(...keyParts),
    { tags: options.tags, revalidate }
  );
}
