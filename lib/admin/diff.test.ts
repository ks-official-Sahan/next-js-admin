import assert from "node:assert/strict";
import { test } from "node:test";

import { diffValues } from "./diff";

test("identical values have no difference, and empty sides are handled", () => {
  assert.deepEqual(diffValues({ a: 1 }, { a: 1 }), []);
  assert.deepEqual(diffValues(null, null), []);
  assert.deepEqual(diffValues(undefined, undefined), []);
});

test("added, removed and changed fields are told apart", () => {
  assert.deepEqual(diffValues({ role: "EDITOR", name: "A", gone: true }, { role: "MANAGER", name: "A", fresh: 1 }), [
    { path: "fresh", kind: "added", after: "1" },
    { path: "gone", kind: "removed", before: "true" },
    { path: "role", kind: "changed", before: "EDITOR", after: "MANAGER" },
  ]);
});

test("a row with only an after (created) or only a before (deleted) lists every field", () => {
  assert.deepEqual(diffValues(null, { a: 1, b: "x" }), [
    { path: "a", kind: "added", after: "1" },
    { path: "b", kind: "added", after: "x" },
  ]);
  assert.deepEqual(diffValues({ a: 1 }, undefined), [{ path: "a", kind: "removed", before: "1" }]);
});

test("nested objects use dotted paths and arrays use indexes", () => {
  const rows = diffValues({ perms: { EDITOR: ["a", "b"] } }, { perms: { EDITOR: ["a", "c"] } });
  assert.deepEqual(rows, [{ path: "perms.EDITOR[1]", kind: "changed", before: "b", after: "c" }]);
});

test("values of other types are shown as JSON, and long text is cut", () => {
  assert.deepEqual(diffValues({ on: false, n: null }, { on: true, n: 5 }), [
    { path: "n", kind: "changed", before: "null", after: "5" },
    { path: "on", kind: "changed", before: "false", after: "true" },
  ]);
  const [row] = diffValues({ text: "a" }, { text: "b".repeat(1000) });
  assert.equal(row.after!.length, 301);
  assert.ok(row.after!.endsWith("…"));
});

test("empty containers and very deep values do not blow up", () => {
  assert.deepEqual(diffValues({ list: [] }, { list: [1] }), [
    { path: "list", kind: "removed", before: "[]" },
    { path: "list[0]", kind: "added", after: "1" },
  ]);
  let deep: unknown = "end";
  for (let index = 0; index < 20; index += 1) deep = { next: deep };
  assert.equal(diffValues(deep, {}).length > 0, true);
});

test("the row count is capped", () => {
  const big = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [`k${index}`, index]));
  assert.equal(diffValues({}, big).length, 200);
});
