import assert from "node:assert/strict";
import { test } from "node:test";

import { kv } from "@/lib/cache/redis";

import { kvSettingKey, readKvSetting, writeKvSetting } from "./kv";

// No Upstash env in tests: lib/cache/redis falls back to its in-memory store,
// so kv.set below stands in for a save made on another instance.

const on = { enabled: true, reason: "a" };
const off = { enabled: false, reason: "b" };

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("readKvSetting serves fresh, then stale-while-revalidate, then waits once too stale", async () => {
  const t0 = 1_000_000;
  await writeKvSetting("maintenance", on);
  assert.deepEqual(await readKvSetting("maintenance", t0), on);

  // Another instance changes the value.
  await kv.set(kvSettingKey("maintenance"), off);

  // Fresh memo: no KV read, old value.
  assert.deepEqual(await readKvSetting("maintenance", t0 + 1_000), on);

  // Aged: the old value comes back at once and a refresh starts...
  assert.deepEqual(await readKvSetting("maintenance", t0 + 6_000), on);
  await flush();
  // ...which the next read sees.
  assert.deepEqual(await readKvSetting("maintenance", t0 + 6_001), off);

  // Past the staleness bound: the read waits for KV instead of serving an old value.
  await kv.set(kvSettingKey("maintenance"), on);
  assert.deepEqual(await readKvSetting("maintenance", t0 + 6_000 + 61_000), on);
});

test("writeKvSetting on this instance is visible to the very next read", async () => {
  const t0 = 5_000_000;
  await writeKvSetting("maintenance", off);
  assert.deepEqual(await readKvSetting("maintenance", t0), off);
  await writeKvSetting("maintenance", on);
  assert.deepEqual(await readKvSetting("maintenance", t0 + 1), on);
});
