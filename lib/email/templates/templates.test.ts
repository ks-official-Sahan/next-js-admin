import assert from "node:assert/strict";
import { test } from "node:test";

import { EmailGuardError } from "@sahan-sac/email-kit/guards";
import {
  accountCreated,
  contactAutoReply,
  contactNotify,
  forcedLogout,
  invite,
  mfaCode,
  mfaToggled,
  newLogin,
  passwordChanged,
  passwordReset,
  type Rendered,
} from "./index";
import { oneLine } from "@sahan-sac/email-kit/layout";

const XSS = `<script>alert(1)</script><img src=x onerror="alert(2)">`;
const NAME = `Eve\r\nBcc: victim@example.com ${XSS}`;
const URL_OK = "https://example.com/admin/set-password?token=abc.def";

function assertSafe(rendered: Rendered) {
  assert.equal(/[\r\n]/.test(rendered.subject), false, `subject has a line break: ${rendered.subject}`);
  assert.ok(rendered.subject.length <= 200);
  assert.equal(rendered.html.includes("<script"), false, "raw <script> in html");
  assert.equal(/<img[^>]*onerror/i.test(rendered.html), false, "live onerror handler in html");
  assert.ok(rendered.html.startsWith("<!doctype html>"));
  assert.ok(rendered.text.length > 0);
}

test("oneLine flattens whitespace and cuts to a length", () => {
  assert.equal(oneLine("a\r\nb\t c"), "a b c");
  assert.equal(oneLine("x".repeat(100), 10), "xxxxxxxxx…");
});

test("every template survives hostile names, and subjects stay on one line", () => {
  const device = { name: NAME, ip: XSS, browser: XSS, os: XSS, when: XSS };
  for (const rendered of [
    mfaCode({ name: NAME, code: "123456", minutes: 10 }),
    newLogin(device),
    passwordChanged(device),
    mfaToggled({ ...device, enabled: true }),
    mfaToggled({ ...device, enabled: false }),
    forcedLogout({ name: NAME, by: NAME, reason: XSS }),
    invite({ name: NAME, inviterName: NAME, role: XSS, url: URL_OK, expiresHours: 48 }),
    passwordReset({ name: NAME, url: URL_OK, expiresMinutes: 30 }),
    contactNotify({ name: NAME, email: `a@b.cd${XSS}`, subject: XSS, message: XSS, receivedAt: XSS, adminUrl: URL_OK }),
    contactAutoReply({ name: NAME }),
  ]) {
    assertSafe(rendered);
  }
});

test("hostile text appears escaped in the html body", () => {
  const rendered = contactNotify({ name: "Eve", email: "eve@example.com", message: XSS, receivedAt: "now" });
  assert.ok(rendered.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(rendered.text.includes("<script>alert(1)</script>"), "the plain text part keeps the literal text");
});

test("line breaks in a contact message become <br> and stay out of the subject", () => {
  const rendered = contactNotify({ name: "Eve", email: "eve@example.com", message: "one\ntwo", receivedAt: "now" });
  assert.ok(rendered.html.includes("one<br>two"));
  assert.equal(rendered.subject, "New message from Eve");
});

test("links must be http or https, and the address is escaped", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "not a url"]) {
    assert.throws(() => passwordReset({ url: bad, expiresMinutes: 30 }), EmailGuardError);
    assert.throws(() => invite({ inviterName: "Owner", role: "Editor", url: bad, expiresHours: 48 }), EmailGuardError);
  }
  const rendered = passwordReset({ url: "https://example.com/a?x=1&y=2", expiresMinutes: 30 });
  assert.ok(rendered.html.includes('href="https://example.com/a?x=1&amp;y=2"'));
  assert.ok(rendered.text.includes("https://example.com/a?x=1&y=2"));
});

test("the content of each email is what the recipient needs", () => {
  const code = mfaCode({ name: "Jordan", code: "482913", minutes: 10 });
  assert.ok(code.subject.includes("482913"));
  assert.ok(code.text.includes("expires in 10 minutes"));

  const reset = passwordReset({ url: URL_OK, expiresMinutes: 30 });
  assert.ok(reset.text.includes(URL_OK));
  assert.ok(reset.text.includes("30 minutes"));

  assert.ok(invite({ inviterName: "Owner", role: "Editor", url: URL_OK, expiresHours: 48 }).text.includes("48 hours"));
  assert.ok(mfaToggled({ when: "now", enabled: false }).subject.includes("turned off"));
  assert.ok(forcedLogout({ by: "Owner" }).text.includes("by Owner"));
  assert.ok(contactAutoReply({ name: "Eve" }).subject.includes("Eve"));
});

test("a missing name falls back to a neutral greeting", () => {
  assert.ok(newLogin({ when: "now" }).text.includes("Hi there"));
});

test("account emails carry a sign-in link, and their copies carry no link at all", () => {
  const signInUrl = "https://example.com/s/abc.def";
  const emails = [
    (copy: boolean) => invite({ inviterName: "Owner", role: "EDITOR", url: "https://example.com/a/tok.tag", expiresHours: 72, signInUrl }, { copy }),
    (copy: boolean) => passwordReset({ url: "https://example.com/a/tok.tag", expiresMinutes: 60, signInUrl }, { copy }),
    (copy: boolean) => accountCreated({ creatorName: "Owner", role: "EDITOR", signInUrl }, { copy }),
  ];
  for (const render of emails) {
    const original = render(false);
    assert.ok(original.text.includes(signInUrl));
    const copy = render(true);
    assert.ok(copy.subject.startsWith("Copy: "));
    for (const body of [copy.html, copy.text]) {
      assert.ok(!body.includes("https://example.com/"), body);
    }
  }
});
