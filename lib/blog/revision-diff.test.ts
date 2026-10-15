import assert from "node:assert/strict";
import { test } from "node:test";

import { bodyLines, compareSnapshots } from "./revision-diff";

const base = {
  slug: "a",
  title: "Old title",
  excerpt: null,
  content: "<h2>Intro</h2><p>One &amp; two</p><ul><li>x</li><li>y</li></ul>",
  topic: "Release",
  tags: ["next"],
  coverMediaId: null,
  coverAlt: null,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  noindex: false,
};

test("bodyLines gives one line per block, tags stripped and entities decoded", () => {
  assert.deepEqual(bodyLines(base.content), ["Intro", "One & two", "x", "y"]);
});

test("compareSnapshots lists changed fields and diffs the body by line", () => {
  const result = compareSnapshots(base, { ...base, title: "New title", content: "<h2>Intro</h2><p>One &amp; three</p><ul><li>x</li><li>y</li></ul>" });
  assert.deepEqual(result.fields, [{ path: "title", kind: "changed", before: "Old title", after: "New title" }]);
  assert.deepEqual(
    result.content.filter((op) => op.kind === "removed" || op.kind === "added"),
    [
      { kind: "removed", text: "One & two" },
      { kind: "added", text: "One & three" },
    ]
  );
});
