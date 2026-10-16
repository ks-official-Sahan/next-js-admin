import "server-only";

import { randomUUID } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";

import { dbConfigured } from "@/lib/db/state";
import { noteCache } from "@/lib/observability/timing";

import type { Kv } from "./memory";
import { kv } from "./redis";

// The only file that wraps Next's cache. Cache Components is on
// (next.config.ts), so cached() runs its loader inside a "use cache" scope:
// cacheTag() for on-demand invalidation and cacheLife() for the time-based
// refresh replace unstable_cache and the revalidate segment config.
//
// "use cache" keeps its entries in memory per server instance: they do not
// survive a cold serverless start or a deploy (unstable_cache's data cache
// did). A Redis (Upstash, or in-memory when unconfigured) read-through runs
// inside the scope as the durable layer, so a cold instance answers a warm
// key in one round trip instead of a database query. It is capped to a short
// TTL and purged by tag on invalidate(), so it never outlives the data it
// caches by more than that cap even if a purge is ever missed.

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

/**
 * The Redis read-through behind cached(). The value and the tags'
 * generations are read in parallel (one round trip: the Upstash client
 * pipelines concurrent commands into one request). Concurrent misses are not
 * merged here: "use cache" already shares one pending fill per cache key, and
 * a promise shared across renders would hang every waiter once the render
 * that started it ends (Next stops a finished prerender's pending IO).
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

  noteCache("load");
  const value = await load();
  const envelope: Envelope<T> = { v: value, g: generations };
  await store.set(dataKey, envelope, { ttlSeconds }).catch(() => false);
  return value;
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

interface Entry {
  load: (...args: unknown[]) => Promise<unknown>;
  tags: string[];
  revalidate: number | false;
  select?: (value: unknown) => unknown;
}

/**
 * Loaders by cache id. A "use cache" function's arguments and closure become
 * its cache key and must be serializable, so the loader itself cannot be
 * passed in or captured: cachedRun() receives the id and looks the loader up
 * here. cached() registers it before the first call can reach cachedRun().
 */
const registry = new Map<string, Entry>();

/** cacheLife for a revalidate window: refresh after it, keep serving stale up to a day. */
function lifeFor(revalidate: number) {
  return { stale: Math.min(revalidate, 300), revalidate, expire: Math.max(revalidate * 2, 86_400) };
}

async function cachedRun(id: string, args: unknown[]): Promise<unknown> {
  "use cache";
  const entry = registry.get(id);
  if (!entry) throw new Error(`cached(): no loader registered for "${id}"`);
  cacheTag(...entry.tags);
  if (entry.revalidate === false) cacheLife("max");
  else cacheLife(lifeFor(entry.revalidate));
  const load = () => entry.load(...args);
  let value: unknown;
  if (entry.revalidate === false) {
    noteCache("load");
    value = await load();
  } else {
    const keyParts = args.length === 0 ? id.split(":") : [...id.split(":"), JSON.stringify(args)];
    value = await readThrough(kv, keyParts, entry.tags, Math.min(entry.revalidate, REDIS_CACHE_CAP_SECONDS), load);
  }
  return entry.select ? entry.select(value) : value;
}

/**
 * Caches an async read under `keyParts`, tagged for on-demand invalidation.
 * Arguments must be serializable (they are part of the key). `select` runs
 * on every cache fill, after the Redis layer: the place for a filter that
 * reads the clock (a clock read outside a cache scope makes a page dynamic,
 * and the Redis copy may be older than the fill). Never put a
 * code-default fallback inside `fn`: throw instead and use loadOrNull()
 * outside, so a fallback is never cached.
 */
export function cached<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { tags: string[]; revalidate?: number | false; select?: (value: Result) => Result }
): (...args: Args) => Promise<Result> {
  const id = keyParts.join(":");
  registry.set(id, {
    load: fn as unknown as Entry["load"],
    tags: options.tags,
    revalidate: options.revalidate ?? DEFAULT_REVALIDATE_SECONDS,
    select: options.select as Entry["select"],
  });
  // Without a database every loader throws, and an error thrown inside a
  // "use cache" fill fails the prerender even when the caller catches it. So
  // the loader runs directly and its error reaches the caller's fallback
  // (loadOrNull, orDefault) outside any cache scope.
  return (...args: Args) => (dbConfigured() ? (cachedRun(id, args) as Promise<Result>) : fn(...args));
}
