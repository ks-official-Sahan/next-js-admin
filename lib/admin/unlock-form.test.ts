import assert from "node:assert/strict";
import { test } from "node:test";

import { UNLOCK_FORM_HEADERS, unlockFormHtml, unlockFormPath } from "./unlock-form";

test("a usable unlock path is accepted and normalized", () => {
  assert.equal(unlockFormPath("/k/3f9a7c2e"), "/k/3f9a7c2e");
  assert.equal(unlockFormPath("  /admin/open-sesame-42/  "), "/admin/open-sesame-42");
  assert.equal(unlockFormPath("/a_b-c/d-e_f"), "/a_b-c/d-e_f");
});

test("unset, short, oddly shaped or reserved paths turn the form off", () => {
  for (const raw of [undefined, "", "   ", "/short", "k/3f9a7c2e", "/k//3f9a7c2e", "/k/3f9a?x=1", "/k/3f9a.html", "/k/%2e%2e/x", `/${"a".repeat(130)}`]) {
    assert.equal(unlockFormPath(raw), null, String(raw));
  }
  for (const raw of ["/api/unlock-now", "/_next/unlock-now", "/admin/login", "/admin/login/extra", "/admin/forgot-password", "/admin/set-password", "/admin/locked"]) {
    assert.equal(unlockFormPath(raw), null, raw);
  }
});

test("the form posts a password field to its own path and never puts the secret in a URL", () => {
  const html = unlockFormHtml({ action: "/k/3f9a7c2e", failed: false });
  assert.match(html, /<form method="post" action="\/k\/3f9a7c2e"/);
  assert.match(html, /name="secret" type="password" autocomplete="current-password"/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.match(unlockFormHtml({ action: "/k/3f9a7c2e", failed: true }), /role="alert"/);
});

test("the page is never cached, indexed, framed or referred on", () => {
  assert.match(UNLOCK_FORM_HEADERS["Cache-Control"], /no-store/);
  // no-referrer makes the browser send Origin: null on the form's POST, which fails the origin check.
  assert.equal(UNLOCK_FORM_HEADERS["Referrer-Policy"], "same-origin");
  assert.match(UNLOCK_FORM_HEADERS["Content-Security-Policy"], /form-action 'self'/);
  assert.match(UNLOCK_FORM_HEADERS["Content-Security-Policy"], /frame-ancestors 'none'/);
});
