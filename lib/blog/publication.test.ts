import assert from "node:assert/strict";
import { test } from "node:test";

import { isPublicPost } from "./publication";

test("a published post is public", () => {
  assert.equal(isPublicPost("PUBLISHED", null, new Date("2026-01-01T00:00:00.000Z")), true);
});

test("a scheduled post becomes public at its publish time", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(isPublicPost("SCHEDULED", new Date(now.getTime() - 1), now), true);
  assert.equal(isPublicPost("SCHEDULED", now, now), true);
  assert.equal(isPublicPost("SCHEDULED", new Date(now.getTime() + 1), now), false);
});

test("drafts and archived posts are never public", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(isPublicPost("DRAFT", now, now), false);
  assert.equal(isPublicPost("ARCHIVED", now, now), false);
});
