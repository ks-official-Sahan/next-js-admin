import { AsyncLocalStorage } from "node:async_hooks";

// Per-request timing for route handlers: `timed(handler)` measures the
// handler and adds a Server-Timing header, with the Redis read-through hits
// and misses and the loads (reads that reached the database) the request
// caused. lib/cache/cached.ts reports those through noteCache(). Zero hits,
// misses and loads means the data cache answered. Browsers show the header in
// DevTools; a CDN-cached response keeps the timing of the request that filled it.

interface RequestStats {
  redisHits: number;
  redisMisses: number;
  loads: number;
}

const requestStats = new AsyncLocalStorage<RequestStats>();

/** Counts one cache event against the current request; a no-op outside timed(). */
export function noteCache(event: "redisHit" | "redisMiss" | "load"): void {
  const stats = requestStats.getStore();
  if (!stats) return;
  if (event === "redisHit") stats.redisHits++;
  else if (event === "redisMiss") stats.redisMisses++;
  else stats.loads++;
}

export function serverTimingHeader(durationMs: number, stats: RequestStats): string {
  return `app;dur=${durationMs.toFixed(1)}, cache;desc="redis-hit=${stats.redisHits} redis-miss=${stats.redisMisses} load=${stats.loads}"`;
}

export function timed<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>): (...args: Args) => Promise<Response> {
  return (...args) => {
    const stats: RequestStats = { redisHits: 0, redisMisses: 0, loads: 0 };
    const started = performance.now();
    return requestStats.run(stats, async () => {
      const response = await handler(...args);
      try {
        response.headers.append("Server-Timing", serverTimingHeader(performance.now() - started, stats));
      } catch {
        // A Response with immutable headers (Response.redirect) goes out without timing.
      }
      return response;
    });
  };
}
