import assert from "node:assert/strict";
import { test } from "node:test";
import { isSecretVarName, renderEnvLocal, listSecretVarNames } from "../lib/env-template.mjs";

test("isSecretVarName matches *_SECRET and *_SIGNING_KEY, nothing else", () => {
  assert.equal(isSecretVarName("AUTH_SECRET"), true);
  assert.equal(isSecretVarName("MEDIA_SIGNING_SECRET"), true);
  assert.equal(isSecretVarName("CRON_SECRET"), true);
  assert.equal(isSecretVarName("FOO_SIGNING_KEY"), true);
  assert.equal(isSecretVarName("DATABASE_URL"), false);
  assert.equal(isSecretVarName("RESEND_API_KEY"), false);
  assert.equal(isSecretVarName("ADMIN_EMAIL"), false);
});

const EXAMPLE = [
  "# comment line",
  "ADMIN_EMAIL=",
  "AUTH_SECRET=",
  "AUTH_TRUST_HOST=true",
  "INTERNAL_SIGNING_SECRET=",
  "# ADMIN_ALLOWED_ORIGINS=",
  "DATABASE_URL=",
  "EMAIL_PROVIDER=auto",
  "RESEND_API_KEY=",
  "",
].join("\n");

test("renderEnvLocal fills only blank *_SECRET assignments with the generator", () => {
  let calls = 0;
  const gen = () => `secret-${++calls}`;
  const rendered = renderEnvLocal(EXAMPLE, gen);
  const lines = rendered.split("\n");

  assert.ok(lines.includes("AUTH_SECRET=secret-1"));
  assert.ok(lines.includes("INTERNAL_SIGNING_SECRET=secret-2"));
  assert.equal(calls, 2);
});

test("renderEnvLocal leaves non-secret blanks, comments, and existing defaults untouched", () => {
  const rendered = renderEnvLocal(EXAMPLE, () => "x");
  const lines = rendered.split("\n");

  assert.ok(lines.includes("ADMIN_EMAIL="));
  assert.ok(lines.includes("DATABASE_URL="));
  assert.ok(lines.includes("RESEND_API_KEY="));
  assert.ok(lines.includes("AUTH_TRUST_HOST=true"));
  assert.ok(lines.includes("EMAIL_PROVIDER=auto"));
  assert.ok(lines.includes("# comment line"));
  assert.ok(lines.includes("# ADMIN_ALLOWED_ORIGINS="));
});

test("renderEnvLocal preserves line count and order", () => {
  const rendered = renderEnvLocal(EXAMPLE, () => "x");
  assert.equal(rendered.split("\n").length, EXAMPLE.split("\n").length);
});

test("randomSecret-backed default generator produces a non-empty, url-safe string", async () => {
  const { randomSecret } = await import("../lib/env-template.mjs");
  const value = randomSecret(32);
  assert.equal(typeof value, "string");
  assert.ok(value.length > 0);
  assert.match(value, /^[A-Za-z0-9_-]+$/);
});

test("listSecretVarNames returns every secret var name that would be generated", () => {
  assert.deepEqual(listSecretVarNames(EXAMPLE), ["AUTH_SECRET", "INTERNAL_SIGNING_SECRET"]);
});
