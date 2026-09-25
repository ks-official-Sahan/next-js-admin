import assert from "node:assert/strict";
import { test } from "node:test";

import { computeReadMinutes } from "./readtime";

test("computeReadMinutes rounds up to whole minutes at 200 words per minute", () => {
  assert.equal(computeReadMinutes(""), 1);
  assert.equal(computeReadMinutes("word ".repeat(50)), 1);
  assert.equal(computeReadMinutes("word ".repeat(200)), 1);
  assert.equal(computeReadMinutes("word ".repeat(201)), 2);
  assert.equal(computeReadMinutes("word ".repeat(400)), 2);
  assert.equal(computeReadMinutes("word ".repeat(401)), 3);
});

test("computeReadMinutes ignores extra whitespace", () => {
  assert.equal(computeReadMinutes("   \n\n  \t "), 1);
  assert.equal(computeReadMinutes("a\n\nb\t\tc   d"), 1);
});
