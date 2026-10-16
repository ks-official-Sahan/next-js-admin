import "server-only";

import { randomUUID } from "node:crypto";
import { unstable_cache } from "next/cache";

import { noteCache } from "@/lib/observability/timing";

import type { Kv } from "./memory";
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

function redisTagVersionKey(tag: string): string {
  return `tagversion:${tag}`;
}

/**
 * What the Redis layer stores: the value, plus the generation of each tag
 * when it was read. A hit counts only when every generation still matches,
 * so a purge invalidates every value under the tag without touching it. The
 * envelope also lets a null or undefined result be cached (a bare null is
 * indistinguishable from a missing key), so a lookup for something that does
 * not exist stops reaching the database on every request.
 */
interface Envelope<T> {
  v: T;
  g: string[];
}

const isEnvelope = <T,>(value: unknown): value is Envelope<T> =>
  typeof value === "object" && value !== null && Array.isArray((value as Envelope<T>).g);

const sameGenerations = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

/** Loads already running in this process, so concurrent misses share one database read. */
const inflight = new Map<string, Promise<unknown>>();

/**
 * The Redis read-through behind cached(). The value and the tags'
 * generations are read in parallel (one round trip: the Upstash client
 * pipelines concurrent commands into one request). On a miss, concurrent
 * callers in this process for the same key and generations share one load.
 * A Redis failure is never an error: the value is loaded directly.
 * Exported for tests; use cached() everywhere else.
 */
export async function readThrough<T>(store: Kv, keyParts: string[], tags: string[], ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const dataKey = redisDataKey(keyParts);
  let hit: unknown;
  let generations: string[];
  try {
    const [value, ...versions] = await Promise.all([store.get<unknown>(dataKey), ...tags.map((tag) => store.get<string>(redisTagVersionKey(tag)))]);
    hit = value;
    generations = versions.map((version) => String(version ?? 0));
  } catch {
    // Reading a failed generation lookup as "0" could match a value written
    // before a purge, so skip Redis for this call instead.
    noteCache("load");
    return load();
  }
  if (isEnvelope<T>(hit) && sameGenerations(hit.g, generations)) {
    noteCache("redisHit");
    return hit.v;
  }
  noteCache("redisMiss");

  const flightKey = `${dataKey}|${generations.join(",")}`;
  const running = inflight.get(flightKey);
  if (running) return running as Promise<T>;
  const loading = (async () => {
    noteCache("load");
    const value = await load();
    const envelope: Envelope<T> = { v: value, g: generations };
    await store.set(dataKey, envelope, { ttlSeconds }).catch(() => false);
    return value;
  })().finally(() => inflight.delete(flightKey));
  inflight.set(flightKey, loading);
  return loading;
}

/**
 * Starts a new Redis cache generation for `tag`. Old values expire naturally
 * under the short data TTL; no shared read/modify/write index can grow without
 * bound or lose concurrent cache-key registrations.
 *
 * The generation is a fresh random value, not a counter. A counter key that
 * expires restarts at 1 and can match a value written under the earlier "1"
 * before a purge, serving stale data. A random generation never repeats, and
 * an expired one reads as "0", whose values are older than this key's TTL
 * (twice the data TTL) and so already gone.
 */
export async function purgeRedisTag(tag: string): Promise<void> {
  await kv.set(redisTagVersionKey(tag), randomUUID(), { ttlSeconds: REDIS_CACHE_CAP_SECONDS * 2 });
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
  const redisTtl = revalidate === false ? undefined : Math.min(revalidate, REDIS_CACHE_CAP_SECONDS);

  return unstable_cache(
    async (...args: Args) => {
      if (!redisTtl) {
        noteCache("load");
        return fn(...args);
      }
      return readThrough(kv, keyParts, options.tags, redisTtl, () => fn(...args));
    },
    cacheKey(...keyParts),
    { tags: options.tags, revalidate }
  );
}
