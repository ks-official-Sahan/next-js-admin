import "server-only";

import { Redis } from "@upstash/redis";
import { redisConfigFromEnv } from "@sahan-sac/auth-kit/cache/redis";

import { MemoryKv, type Kv, type KvSetOptions } from "./memory";

// Upstash Redis when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are
// set and valid (https URL) and REDIS_ENABLED is not off, otherwise an
// in-memory store. Redis is never the source of truth for a security
// decision (design notes, D7 and D8): it caches and limits. Every key is
// prefixed so the instance can be shared.

const PREFIX = "app:";

type Env = Record<string, string | undefined>;

export function redisConfigured(env: Env = process.env): boolean {
  return redisConfigFromEnv(env) !== null;
}

class RedisKv implements Kv {
  constructor(private readonly redis: Redis) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    return (await this.redis.get<T>(PREFIX + key)) ?? null;
  }

  async set(key: string, value: unknown, options: KvSetOptions = {}): Promise<boolean> {
    const settings = {
      ...(options.ttlSeconds ? { ex: options.ttlSeconds } : {}),
      ...(options.nx ? { nx: true as const } : {}),
    };
    // With `nx` Redis answers null when the key already existed.
    const result = await this.redis.set(PREFIX + key, value as never, settings as never);
    return result !== null;
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.redis.del(...keys.map((key) => PREFIX + key));
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    const prefixed = PREFIX + key;
    if (!ttlSeconds) return this.redis.incr(prefixed);
    // One transaction: a failure between the two commands must not leave a
    // counter without an expiry, which for a failure counter means a permanent
    // lock. NX sets the TTL only when the key has none, that is on creation.
    const [next] = await this.redis.multi().incr(prefixed).expire(prefixed, ttlSeconds, "NX").exec<[number, number]>();
    return next;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.redis.expire(PREFIX + key, ttlSeconds)) === 1;
  }
}

const globalForKv = globalThis as unknown as {
  appRedis?: Redis | null;
  appKv?: Kv;
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
    globalForKv.appKv = redis ? new RedisKv(redis) : new MemoryKv();
  }
  return globalForKv.appKv;
}

/** Which backend is active, for the integration health screen. */
export function kvBackend(): "upstash" | "memory" {
  return getRedis() ? "upstash" : "memory";
}

/** Lazy handle: importing it never connects. */
export const kv: Kv = {
  get: <T = unknown>(key: string) => getKv().get<T>(key),
  set: (key, value, options) => getKv().set(key, value, options),
  del: (...keys) => getKv().del(...keys),
  incr: (key, ttlSeconds) => getKv().incr(key, ttlSeconds),
  expire: (key, ttlSeconds) => getKv().expire(key, ttlSeconds),
};
