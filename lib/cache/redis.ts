import "server-only";

import { Redis } from "@upstash/redis";
import { redisConfigFromEnv, RedisKv } from "@sahan-sac/auth-kit/cache/redis";

import { log } from "@/lib/log";

import { FailoverKv, MemoryKv, type Kv } from "./memory";

// Upstash Redis when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are
// set and valid (https URL) and REDIS_ENABLED is not off, otherwise an
// in-memory store. A configured Redis that errors or times out falls back to
// memory for 30 s, then is tried again, so an outage never fails a request.
// Redis is never the source of truth for a security decision
// (design notes, D7 and D8): it caches and limits. Every key is
// prefixed so the instance can be shared.

const PREFIX = "app:";

type Env = Record<string, string | undefined>;

export function redisConfigured(env: Env = process.env): boolean {
  return redisConfigFromEnv(env) !== null;
}

const globalForKv = globalThis as unknown as {
  appRedis?: Redis | null;
  appKv?: Kv;
  appFailover?: FailoverKv | null;
};

/** The Upstash client, or null when Redis is not configured. */
export function getRedis(): Redis | null {
  if (globalForKv.appRedis === undefined) {
    const config = redisConfigFromEnv();
    globalForKv.appRedis = config ? new Redis(config) : null;
  }
  return globalForKv.appRedis;
}

export function getKv(): Kv {
  if (!globalForKv.appKv) {
    const redis = getRedis();
    globalForKv.appFailover = redis
      ? new FailoverKv(new RedisKv(redis, PREFIX), new MemoryKv(), {
          onFailover: (error) => log.warn("redis unavailable, using memory for 30 s", { error: String(error) }),
        })
      : null;
    globalForKv.appKv = globalForKv.appFailover ?? new MemoryKv();
  }
  return globalForKv.appKv;
}

/** Which backend is active, for the integration health screen. "upstash-degraded": configured but failing, memory serves for now. */
export function kvBackend(): "upstash" | "upstash-degraded" | "memory" {
  if (!getRedis()) return "memory";
  getKv();
  return globalForKv.appFailover?.degraded ? "upstash-degraded" : "upstash";
}

/** Writes and reads a 30 s probe key on Redis itself, never on the memory fallback. False when Redis is not configured. */
export async function pingRedis(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const key = `${PREFIX}health:ping`;
  await redis.set(key, Date.now(), { ex: 30 });
  return (await redis.get(key)) !== null;
}

/** Lazy handle: importing it never connects. */
export const kv: Kv = {
  get: <T = unknown>(key: string) => getKv().get<T>(key),
  set: (key, value, options) => getKv().set(key, value, options),
  del: (...keys) => getKv().del(...keys),
  incr: (key, ttlSeconds) => getKv().incr(key, ttlSeconds),
  expire: (key, ttlSeconds) => getKv().expire(key, ttlSeconds),
};
