import assert from "node:assert/strict";
import { test } from "node:test";

import { ensureUniqueSlug, isValidSlug, slugify } from "./slug";

test("isValidSlug accepts lowercase hyphenated slugs and rejects the rest", () => {
  for (const good of ["hello", "hello-world", "a1-b2-c3", "x".repeat(96)]) {
    assert.equal(isValidSlug(good), true, good);
  }
  for (const bad of ["", "Hello", "hello world", "-hello", "hello-", "hello_world", "hello!", "x".repeat(97)]) {
    assert.equal(isValidSlug(bad), false, bad);
  }
});

test("slugify lowercases, strips accents and punctuation, and collapses separators", () => {
  assert.equal(slugify("Upgraded the portfolio to Next.js 16!"), "upgraded-the-portfolio-to-next-js-16");
  assert.equal(slugify("Café résumé"), "cafe-resume");
  assert.equal(slugify("  leading and trailing  "), "leading-and-trailing");
  assert.equal(isValidSlug(slugify("Something Weird @@ // ??")), true);
});

test("slugify caps length at SLUG_MAX_LENGTH and stays valid", () => {
  const result = slugify("a".repeat(200));
  assert.ok(result.length <= 96);
  assert.equal(isValidSlug(result), true);
});

test("ensureUniqueSlug returns the candidate when free, else appends -2, -3, ...", () => {
  assert.equal(ensureUniqueSlug("hello", new Set()), "hello");
  assert.equal(ensureUniqueSlug("hello", new Set(["hello"])), "hello-2");
  assert.equal(ensureUniqueSlug("hello", new Set(["hello", "hello-2"])), "hello-3");
});

test("ensureUniqueSlug never exceeds the max length even with a long base", () => {
  const base = "a".repeat(96);
  const taken = new Set([base]);
  const result = ensureUniqueSlug(base, taken);
  assert.ok(result.length <= 96);
  assert.equal(isValidSlug(result), true);
});
