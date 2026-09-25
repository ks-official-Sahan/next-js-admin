import assert from "node:assert/strict";
import { test } from "node:test";

import { COLLECTIONS, PAGE_SLUGS, TAGS, isPageSlug, isValidPostSlug, staticTags } from "./tags";

test("tag builders follow the documented scheme", () => {
  assert.equal(TAGS.cms, "cms");
  assert.equal(TAGS.page("home"), "cms:page:home");
  assert.equal(TAGS.page("site"), "cms:page:site");
  assert.equal(TAGS.collection("projects"), "collection:projects");
  assert.equal(TAGS.blogList, "blog:list");
  assert.equal(TAGS.blogPost("hello-world"), "blog:post:hello-world");
  assert.equal(TAGS.blogTaxonomy, "blog:taxonomy");
  assert.equal(TAGS.siteConfig, "site:config");
  assert.equal(TAGS.settingsPublic, "settings:public");
  assert.equal(TAGS.chatbotKnowledge, "chatbot:knowledge");
});

test("post slugs are strictly limited before they reach a tag", () => {
  for (const good of ["a", "hello-world", "post-2026-09", "x".repeat(96)]) {
    assert.equal(isValidPostSlug(good), true, good);
  }
  for (const bad of ["", "Hello", "a b", "a_b", "-a", "a-", "a--b", "a/b", "../x", "a:b", "x".repeat(97), "é"]) {
    assert.equal(isValidPostSlug(bad), false, JSON.stringify(bad));
    assert.throws(() => TAGS.blogPost(bad), /Invalid post slug/);
  }
});

test("staticTags lists every slug-independent tag once", () => {
  const tags = staticTags();
  assert.equal(new Set(tags).size, tags.length);
  assert.ok(tags.includes("cms"));
  for (const slug of PAGE_SLUGS) assert.ok(tags.includes(TAGS.page(slug)));
  for (const name of COLLECTIONS) assert.ok(tags.includes(TAGS.collection(name)));
  for (const tag of ["blog:list", "blog:taxonomy", "site:config", "settings:public", "chatbot:knowledge"]) {
    assert.ok(tags.includes(tag), tag);
  }
  assert.equal(tags.some((tag) => tag.startsWith("blog:post:")), false);
});

test("isPageSlug accepts only the six page slugs", () => {
  for (const slug of PAGE_SLUGS) assert.equal(isPageSlug(slug), true);
  assert.equal(isPageSlug("blog"), false);
  assert.equal(isPageSlug(""), false);
});
