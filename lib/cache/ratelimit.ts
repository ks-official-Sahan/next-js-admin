import "server-only";

import { createRateLimit } from "@sahan-sac/auth-kit/cache/ratelimit";

import { authKit, LIMITS, type LimitName } from "@/lib/auth/kit-config";

import { getRedis } from "./redis";

// Sliding-window rate limits over this app's own bucket catalogue
// (lib/auth/kit-config.ts's LIMITS). Upstash when configured, otherwise an
// in-memory window (per instance).

export { LIMITS };
export type { LimitName };
export type { FailMode, LimitBackend, LimitResult, LimitRule } from "@sahan-sac/auth-kit/cache/ratelimit";

const { limit } = createRateLimit(LIMITS, { redis: getRedis(), keyPrefix: `${authKit.keyPrefix}rl:` });

export { limit };
