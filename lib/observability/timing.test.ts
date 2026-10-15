import assert from "node:assert/strict";
import { test } from "node:test";

import { noteCache, serverTimingHeader, timed } from "./timing";

test("timed adds Server-Timing with the cache events of its own request only", async () => {
  const handler = timed(async (hits: number) => {
    for (let i = 0; i < hits; i++) noteCache("redisHit");
    noteCache("load");
    return new Response("ok");
  });
  const [a, b] = await Promise.all([handler(2), handler(0)]);
  assert.match(a.headers.get("Server-Timing") ?? "", /redis-hit=2 redis-miss=0 load=1/);
  assert.match(b.headers.get("Server-Timing") ?? "", /redis-hit=0 redis-miss=0 load=1/);
  assert.match(a.headers.get("Server-Timing") ?? "", /^app;dur=\d+\.\d/);
});

test("noteCache outside timed() is a no-op, and a redirect keeps its immutable headers", async () => {
  noteCache("load");
  const response = await timed(async () => Response.redirect("https://example.com/", 307))();
  assert.equal(response.status, 307);
  assert.equal(serverTimingHeader(1.25, { redisHits: 1, redisMisses: 2, loads: 3 }), 'app;dur=1.3, cache;desc="redis-hit=1 redis-miss=2 load=3"');
});
