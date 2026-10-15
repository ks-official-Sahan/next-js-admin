import assert from "node:assert/strict";
import { test } from "node:test";

import { diffLines } from "./text-diff";

test("diffLines marks removed and added lines around the kept ones", () => {
  assert.deepEqual(diffLines(["a", "b", "c"], ["a", "x", "c"]), [
    { kind: "same", text: "a" },
    { kind: "removed", text: "b" },
    { kind: "added", text: "x" },
    { kind: "same", text: "c" },
  ]);
});

test("diffLines folds long unchanged runs, keeping context next to each change", () => {
  const before = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const after = ["1", "2", "3", "4", "5", "6", "7", "changed"];
  assert.deepEqual(diffLines(before, after, 2), [
    { kind: "skip", count: 5 },
    { kind: "same", text: "6" },
    { kind: "same", text: "7" },
    { kind: "removed", text: "8" },
    { kind: "added", text: "changed" },
  ]);
});

test("diffLines on identical input is one fold, and on empty input nothing", () => {
  assert.deepEqual(diffLines(["a", "b", "c"], ["a", "b", "c"]), [{ kind: "skip", count: 3 }]);
  assert.deepEqual(diffLines([], []), []);
});
