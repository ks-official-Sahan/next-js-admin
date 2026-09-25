import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import {
  newChatVisitorId,
  signChatVisitorId,
  verifyChatVisitorCookie,
  chatVisitorCookieOptions,
} from "./visitor-cookie";

const SECRET = "test-secret";

describe("chat visitor cookie", () => {
  test("a freshly signed id verifies", () => {
    const id = newChatVisitorId();
    const cookie = signChatVisitorId(id, SECRET);
    assert.equal(verifyChatVisitorCookie(cookie, SECRET), id);
  });

  test("rejects a wrong secret", () => {
    const cookie = signChatVisitorId(newChatVisitorId(), SECRET);
    assert.equal(verifyChatVisitorCookie(cookie, "other-secret"), null);
  });

  test("rejects a tampered id", () => {
    const cookie = signChatVisitorId(newChatVisitorId(), SECRET);
    const [, sig] = cookie.split(".");
    assert.equal(verifyChatVisitorCookie(`tampered-id.${sig}`, SECRET), null);
  });

  test("rejects malformed values", () => {
    assert.equal(verifyChatVisitorCookie(null, SECRET), null);
    assert.equal(verifyChatVisitorCookie("", SECRET), null);
    assert.equal(verifyChatVisitorCookie("no-dot-here", SECRET), null);
    assert.equal(verifyChatVisitorCookie(".sig-only", SECRET), null);
    assert.equal(verifyChatVisitorCookie("id-only.", SECRET), null);
    assert.equal(verifyChatVisitorCookie("a".repeat(300) + ".sig", SECRET), null);
  });

  test("two ids never collide and each round-trips", () => {
    const a = newChatVisitorId();
    const b = newChatVisitorId();
    assert.notEqual(a, b);
    assert.equal(verifyChatVisitorCookie(signChatVisitorId(a, SECRET), SECRET), a);
    assert.equal(verifyChatVisitorCookie(signChatVisitorId(b, SECRET), SECRET), b);
  });

  test("cookie options are HttpOnly, SameSite=Lax, and Secure only in production", () => {
    assert.deepEqual(chatVisitorCookieOptions(false), {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
    assert.equal(chatVisitorCookieOptions(true).secure, true);
  });
});
