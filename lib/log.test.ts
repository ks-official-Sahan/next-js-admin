import assert from "node:assert/strict";
import { test } from "node:test";

import { AUDIT_SENSITIVE_KEY, REDACTED, redact } from "./log";

test("redact hides sensitive keys at any depth", () => {
  const out = redact({
    email: "a@b.com",
    password: "hunter2",
    nested: { apiKey: "k", list: [{ token: "t", ok: 1 }] },
    Authorization: "Bearer x",
  }) as Record<string, unknown>;

  assert.equal(out.email, "a@b.com");
  assert.equal(out.password, REDACTED);
  assert.equal(out.Authorization, REDACTED);
  const nested = out.nested as { apiKey: unknown; list: Array<{ token: unknown; ok: unknown }> };
  assert.equal(nested.apiKey, REDACTED);
  assert.equal(nested.list[0].token, REDACTED);
  assert.equal(nested.list[0].ok, 1);
});

test("redact leaves primitives, null and undefined alone", () => {
  assert.equal(redact("text"), "text");
  assert.equal(redact(5), 5);
  assert.equal(redact(null), null);
  assert.equal(redact(undefined), undefined);
});

test("redact turns an Error into name and message only", () => {
  const out = redact(new TypeError("boom")) as { name: string; message: string; stack?: string };
  assert.deepEqual(out, { name: "TypeError", message: "boom" });
});

test("redact serialises dates and stops at a maximum depth", () => {
  assert.equal(redact(new Date("2026-09-21T00:00:00.000Z")), "2026-09-21T00:00:00.000Z");
  let deep: Record<string, unknown> = { leaf: "x" };
  for (let i = 0; i < 20; i += 1) deep = { next: deep };
  assert.ok(JSON.stringify(redact(deep)).includes("[truncated]"));
});

test("the audit matcher keeps ordinary fields that only look sensitive", () => {
  const out = redact(
    { keywords: ["a"], sortKey: 3, password: "x", codeHash: "y", token: "z", status: "ok" },
    AUDIT_SENSITIVE_KEY
  ) as Record<string, unknown>;

  assert.deepEqual(out.keywords, ["a"]);
  assert.equal(out.sortKey, 3);
  assert.equal(out.status, "ok");
  assert.equal(out.password, REDACTED);
  assert.equal(out.codeHash, REDACTED);
  assert.equal(out.token, REDACTED);
});

test("the broad matcher over-redacts on purpose", () => {
  const out = redact({ keywords: ["a"], statusCode: 500 }) as Record<string, unknown>;
  assert.equal(out.keywords, REDACTED);
  assert.equal(out.statusCode, REDACTED);
});
