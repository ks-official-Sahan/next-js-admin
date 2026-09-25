import assert from "node:assert/strict";
import { test } from "node:test";

import { loadOrNull } from "./fallback";

test("returns null without reading when the database is not configured", async () => {
  let called = false;
  const result = await loadOrNull(
    async () => {
      called = true;
      return "value";
    },
    { configured: false }
  );
  assert.equal(result, null);
  assert.equal(called, false);
});

test("returns the value when the read works", async () => {
  assert.equal(await loadOrNull(async () => 42, { configured: true, buildPhase: false }), 42);
  assert.equal(await loadOrNull(async () => 0, { configured: true, buildPhase: true }), 0);
});

test("a failed read at runtime is rethrown so a stale page keeps being served", async () => {
  await assert.rejects(
    loadOrNull(
      async () => {
        throw new Error("db down");
      },
      { configured: true, buildPhase: false }
    ),
    /db down/
  );
});

test("a failed read during the build falls back to defaults and reports the error", async () => {
  const errors: unknown[] = [];
  const result = await loadOrNull(
    async () => {
      throw new Error("db unreachable");
    },
    { configured: true, buildPhase: true, onError: (error) => errors.push(error) }
  );
  assert.equal(result, null);
  assert.equal(errors.length, 1);
  assert.equal((errors[0] as Error).message, "db unreachable");
});

test("a read that finds nothing also yields null", async () => {
  assert.equal(await loadOrNull(async () => null, { configured: true, buildPhase: false }), null);
});

test("without an explicit context it consults the real environment", async () => {
  // Under test DATABASE_URL is not set by the runner, so nothing is read.
  const before = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(await loadOrNull(async () => "x"), null);
  } finally {
    if (before !== undefined) process.env.DATABASE_URL = before;
  }
});
