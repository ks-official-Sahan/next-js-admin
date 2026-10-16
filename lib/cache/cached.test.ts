import assert from "node:assert/strict";
import { test } from "node:test";

import { purgeRedisTag, readThrough } from "./cached";
import { MemoryKv } from "./memory";
import { kv } from "./redis";

// No Upstash env in tests, so kv is the in-memory store.

test("each purge starts a new generation that never repeats a used one", async () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    await purgeRedisTag("blog:list");
    const generation = await kv.get<string>("tagversion:blog:list");
    assert.equal(typeof generation, "string");
    assert.equal(seen.has(generation as string), false);
    seen.add(generation as string);
  }
});

test("readThrough caches null results, shares one load between concurrent misses, and reloads after a purge", async () => {
  const store = new MemoryKv();
  let loads = 0;
  const load = async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return null;
  };
  const first = await Promise.all([1, 2, 3].map(() => readThrough(store, ["t", "missing"], ["blog:list"], 60, load)));
  assert.deepEqual(first, [null, null, null]);
  assert.equal(loads, 1, "concurrent misses share one load");
  assert.equal(await readThrough(store, ["t", "missing"], ["blog:list"], 60, load), null);
  assert.equal(loads, 1, "a cached null is a hit, not a miss");

  await store.set("tagversion:blog:list", "next-generation");
  assert.equal(await readThrough(store, ["t", "missing"], ["blog:list"], 60, load), null);
  assert.equal(loads, 2, "a new generation invalidates the cached value");
});

test("readThrough loads directly when Redis fails, and never throws for it", async () => {
  const broken = new MemoryKv();
  broken.get = async () => {
    throw new Error("redis down");
  };
  assert.equal(await readThrough(broken, ["t", "x"], ["tag"], 60, async () => 42), 42);
});
