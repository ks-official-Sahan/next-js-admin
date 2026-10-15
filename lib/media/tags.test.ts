import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeTags } from "./tags";

test("normalizeTags trims, lowercases, dedupes and drops invalid or oversized tags", () => {
  assert.deepEqual(normalizeTags(["  Logo ", "logo", "Brand  Kit", "", "<script>", "x".repeat(41), "año-2026"]), [
    "logo",
    "brand kit",
    "año-2026",
  ]);
});

test("normalizeTags keeps at most 20 tags", () => {
  assert.equal(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length, 20);
});
