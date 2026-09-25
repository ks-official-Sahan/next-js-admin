import assert from "node:assert/strict";
import { test } from "node:test";

import { can, defaultMatrix } from "@/lib/auth/rbac-rules";

// Permission split for the blog (design notes, section 9):
// EDITOR may save drafts but not publish, schedule or delete. Pure, against
// the seed default matrix — no database.

test("EDITOR can save drafts (editBlog) but cannot publish, schedule or unpublish (publishBlog)", () => {
  const matrix = defaultMatrix();
  assert.equal(can(matrix, "EDITOR", "editBlog"), true);
  assert.equal(can(matrix, "EDITOR", "publishBlog"), false);
});

test("EDITOR cannot delete or archive posts (deleteBlog)", () => {
  const matrix = defaultMatrix();
  assert.equal(can(matrix, "EDITOR", "deleteBlog"), false);
});

test("EDITOR can still view the list and use the AI helpers", () => {
  const matrix = defaultMatrix();
  assert.equal(can(matrix, "EDITOR", "viewBlog"), true);
  assert.equal(can(matrix, "EDITOR", "generateAI"), true);
});

test("MANAGER and DEVELOPER can publish and delete", () => {
  const matrix = defaultMatrix();
  for (const role of ["MANAGER", "DEVELOPER"] as const) {
    assert.equal(can(matrix, role, "editBlog"), true);
    assert.equal(can(matrix, role, "publishBlog"), true);
    assert.equal(can(matrix, role, "deleteBlog"), true);
  }
});
