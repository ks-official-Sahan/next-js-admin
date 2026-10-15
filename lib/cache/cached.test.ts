import assert from "node:assert/strict";
import { test } from "node:test";

import { purgeRedisTag } from "./cached";
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
