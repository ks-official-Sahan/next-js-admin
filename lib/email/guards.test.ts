import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertAddress,
  assertMailbox,
  assertNoHeaderInjection,
  EmailGuardError,
  escapeHtml,
  MAX_RECIPIENTS,
  prepareMessage,
  safeUrl,
} from "./guards";
import type { EmailMessage } from "./types";

const base: EmailMessage = {
  to: "owner@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
  category: "test",
};

const guardError = (fn: () => unknown, errorClass: string) =>
  assert.throws(fn, (error: unknown) => error instanceof EmailGuardError && error.errorClass === errorClass);

test("escapeHtml handles the five dangerous characters and non-strings", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(42), "42");
});

test("line breaks in a header value are refused", () => {
  for (const bad of ["a\nBcc: x@y.z", "a\rb", "a\0b", "a b", "a b"]) {
    guardError(() => assertNoHeaderInjection(bad, "subject"), "header_injection");
  }
  assertNoHeaderInjection("a plain subject", "subject");
});

test("addresses must be bare, valid and single", () => {
  assert.equal(assertAddress("  Owner@Example.com "), "Owner@Example.com");
  for (const bad of ["", "no-at-sign", "a@b", "a@b..c", "a b@c.de", "a@b.c,d@e.fg", "<a@b.cd>", "a@b.cd\nBcc: x@y.zz", "a".repeat(250) + "@b.cd"]) {
    assert.throws(() => assertAddress(bad), EmailGuardError, bad);
  }
});

test("a sender mailbox may carry a display name, which is quoted", () => {
  assert.equal(assertMailbox("owner@example.com"), "owner@example.com");
  assert.equal(assertMailbox("Jordan S <owner@example.com>"), '"Jordan S" <owner@example.com>');
  assert.equal(assertMailbox('"Jordan" <owner@example.com>'), '"Jordan" <owner@example.com>');
  assert.equal(assertMailbox('Say "hi" <owner@example.com>'), '"Say \\"hi\\"" <owner@example.com>');
  guardError(() => assertMailbox("Name\nBcc: x@y.zz <owner@example.com>"), "header_injection");
  guardError(() => assertMailbox("Name <not-an-address>"), "bad_address");
});

test("only http and https links are allowed", () => {
  assert.equal(safeUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://example.com", "//example.com", "not a url"]) {
    guardError(() => safeUrl(bad), "bad_url");
  }
});

test("prepareMessage normalises and validates", () => {
  const prepared = prepareMessage({ ...base, to: [" a@example.com ", "b@example.com"], replyTo: "r@example.com" });
  assert.deepEqual(prepared.to, ["a@example.com", "b@example.com"]);
  assert.deepEqual(prepared.cc, []);
  assert.equal(prepared.replyTo, "r@example.com");
});

test("prepareMessage refuses hostile or oversized input", () => {
  guardError(() => prepareMessage({ ...base, to: [] }), "no_recipient");
  guardError(() => prepareMessage({ ...base, subject: "Hi\nBcc: evil@example.com" }), "header_injection");
  guardError(() => prepareMessage({ ...base, subject: "   " }), "bad_subject");
  guardError(() => prepareMessage({ ...base, subject: "s".repeat(201) }), "bad_subject");
  guardError(() => prepareMessage({ ...base, html: "x".repeat(200_001) }), "body_too_large");
  guardError(() => prepareMessage({ ...base, replyTo: "x\r\ny@example.com" }), "header_injection");
  guardError(() => prepareMessage({ ...base, bcc: ["a@example.com\nBcc: b@example.com"] }), "header_injection");
  const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, index) => `u${index}@example.com`);
  guardError(() => prepareMessage({ ...base, to: many }), "too_many_recipients");
});
