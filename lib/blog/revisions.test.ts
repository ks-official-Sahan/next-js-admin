import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSnapshot, sameSnapshot, snapshotOf, type PostSnapshot } from "./revisions";

const base: PostSnapshot = {
  slug: "hello-world",
  title: "Hello world",
  excerpt: null,
  content: "<p>Hi</p>",
  topic: "Engineering",
  tags: ["next"],
  coverMediaId: null,
  coverAlt: null,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  noindex: false,
};

test("snapshotOf keeps only the editable fields and copies the tag array", () => {
  const row = { ...base, id: "p1", contentHtml: "<p>Hi</p>", status: "PUBLISHED" };
  const snapshot = snapshotOf(row);
  assert.deepEqual(Object.keys(snapshot).sort(), Object.keys(base).sort());
  assert.notEqual(snapshot.tags, row.tags);
});

test("parseSnapshot fills fields an older snapshot did not store", () => {
  const { noindex: _omitted, canonicalUrl: _alsoOmitted, ...older } = base;
  const parsed = parseSnapshot(older);
  assert.ok(parsed);
  assert.equal(parsed.noindex, false);
  assert.equal(parsed.canonicalUrl, null);
});

test("parseSnapshot rejects an unusable row instead of restoring a guess", () => {
  assert.equal(parseSnapshot(null), null);
  assert.equal(parseSnapshot({ ...base, title: "" }), null);
  assert.equal(parseSnapshot({ ...base, content: 42 }), null);
});

test("sameSnapshot ignores non-editable fields and notices real edits", () => {
  assert.equal(sameSnapshot(base, { ...base }), true);
  assert.equal(sameSnapshot(base, { ...base, title: "Changed" }), false);
  assert.equal(sameSnapshot(base, { ...base, noindex: true }), false);
});
