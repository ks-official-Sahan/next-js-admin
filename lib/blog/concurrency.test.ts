import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSubmittedUpdatedAt } from "./concurrency";

test("parseSubmittedUpdatedAt accepts a valid ISO string", () => {
  const result = parseSubmittedUpdatedAt("2026-01-01T00:00:00.000Z");
  assert.ok(result instanceof Date);
  assert.equal(result?.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("parseSubmittedUpdatedAt rejects missing, empty or unparsable input", () => {
  assert.equal(parseSubmittedUpdatedAt(null), null);
  assert.equal(parseSubmittedUpdatedAt(""), null);
  assert.equal(parseSubmittedUpdatedAt("not a date"), null);
});
