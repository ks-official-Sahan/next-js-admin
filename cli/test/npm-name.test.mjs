import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidNpmName, normalizeToNpmName } from "../lib/npm-name.mjs";

test("isValidNpmName accepts valid unscoped and scoped names", () => {
  assert.equal(isValidNpmName("my-admin-app"), true);
  assert.equal(isValidNpmName("myapp"), true);
  assert.equal(isValidNpmName("@acme/admin"), true);
});

test("isValidNpmName rejects uppercase, spaces, leading dot/underscore, and empty", () => {
  assert.equal(isValidNpmName("MyApp"), false);
  assert.equal(isValidNpmName("my app"), false);
  assert.equal(isValidNpmName(".hidden"), false);
  assert.equal(isValidNpmName("_private"), false);
  assert.equal(isValidNpmName(""), false);
});

test("isValidNpmName rejects names over 214 characters", () => {
  assert.equal(isValidNpmName("a".repeat(215)), false);
  assert.equal(isValidNpmName("a".repeat(214)), true);
});

test("normalizeToNpmName lowercases and replaces invalid characters", () => {
  assert.equal(normalizeToNpmName("My Cool App"), "my-cool-app");
  assert.equal(normalizeToNpmName("My_Cool_App!!"), "my_cool_app");
});

test("normalizeToNpmName strips leading dots/underscores/dashes", () => {
  assert.equal(normalizeToNpmName("...my-app"), "my-app");
  assert.equal(normalizeToNpmName("---app"), "app");
});

test("normalizeToNpmName collapses repeated dashes", () => {
  assert.equal(normalizeToNpmName("my   cool   app"), "my-cool-app");
});

test("normalizeToNpmName falls back to a default for input that normalizes to nothing", () => {
  assert.equal(normalizeToNpmName("..."), "my-admin-app");
  assert.equal(normalizeToNpmName(""), "my-admin-app");
});

test("normalizeToNpmName truncates to 214 characters", () => {
  const long = "a".repeat(300);
  assert.equal(normalizeToNpmName(long).length, 214);
});

test("normalizeToNpmName output is always a valid npm name", () => {
  for (const input of ["My App!!", "..weird__", "already-valid-name", "😀emoji😀name"]) {
    assert.equal(isValidNpmName(normalizeToNpmName(input)), true, `normalizeToNpmName(${input}) should be valid`);
  }
});
