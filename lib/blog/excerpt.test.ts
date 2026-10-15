import assert from "node:assert/strict";
import { test } from "node:test";

import { autoExcerptOf, EXCERPT_CHARS } from "./excerpt";

test("autoExcerptOf collapses whitespace and cuts to EXCERPT_CHARS", () => {
  assert.equal(autoExcerptOf("  One\n\ntwo   three "), "One two three");
  assert.equal(autoExcerptOf("x".repeat(500)).length, EXCERPT_CHARS);
});
