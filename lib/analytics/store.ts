import "server-only";

import { createAnalyticsStore } from "@sahan-sac/analytics-kit/store";

import { getRedis, REDIS_PREFIX } from "@/lib/cache/redis";
import { log } from "@/lib/log";

// The site's analytics store (@sahan-sac/analytics-kit): the app's Upstash
// client and key prefix. Without Redis it records nothing and reads null.
// ANALYTICS_TIME_ZONE (IANA, default UTC) sets where a day starts and ends.
export const analytics = createAnalyticsStore({ redis: getRedis, prefix: REDIS_PREFIX, log, timeZone: process.env.ANALYTICS_TIME_ZONE });
