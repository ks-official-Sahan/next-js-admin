import { test, describe } from "node:test";
import { strict as assert } from "node:assert";

import {
  isMaintenanceExempt,
  signBypassCookie,
  verifyBypassCookie,
  isValidBypassSecret,
  type BypassCookieKeys,
} from "./maintenance-bypass";

const mockKeys: BypassCookieKeys = { secret: "test-secret-key-32-characters!" };

describe("maintenance bypass cookie", () => {
  describe("sign and verify", () => {
    test("valid bypass cookie passes verification", () => {
      const now = Date.now();
      const signed = signBypassCookie(now, mockKeys);
      const verified = verifyBypassCookie(signed, now, mockKeys);
      assert.equal(verified, true);
    });

    test("bypass cookie expires after 2 hours", () => {
      const now = Date.now();
      const signed = signBypassCookie(now, mockKeys);
      // 2 hours later + 1 second
      const later = now + 2 * 60 * 60 * 1000 + 1000;
      const verified = verifyBypassCookie(signed, later, mockKeys);
      assert.equal(verified, false);
    });

    test("bypass cookie valid just before expiry", () => {
      const now = Date.now();
      const signed = signBypassCookie(now, mockKeys);
      // 2 hours - 1 second
      const almostExpired = now + 2 * 60 * 60 * 1000 - 1000;
      const verified = verifyBypassCookie(signed, almostExpired, mockKeys);
      assert.equal(verified, true);
    });

    test("tampered bypass cookie fails verification", () => {
      const now = Date.now();
      const signed = signBypassCookie(now, mockKeys);
      const tampered = signed.slice(0, -5) + "xxxxx"; // Change last 5 chars
      const verified = verifyBypassCookie(tampered, now, mockKeys);
      assert.equal(verified, false);
    });

    test("wrong key fails verification", () => {
      const now = Date.now();
      const signed = signBypassCookie(now, mockKeys);
      const wrongKeys: BypassCookieKeys = { secret: "different-secret-key-32-chars!" };
      const verified = verifyBypassCookie(signed, now, wrongKeys);
      assert.equal(verified, false);
    });

    test("empty cookie fails verification", () => {
      const verified = verifyBypassCookie("", Date.now(), mockKeys);
      assert.equal(verified, false);
    });

    test("undefined cookie fails verification", () => {
      const verified = verifyBypassCookie(undefined, Date.now(), mockKeys);
      assert.equal(verified, false);
    });

    test("malformed cookie fails verification", () => {
      const verified1 = verifyBypassCookie("no-dot-separator", Date.now(), mockKeys);
      const verified2 = verifyBypassCookie("invalid.too.many.dots", Date.now(), mockKeys);
      const verified3 = verifyBypassCookie("not-a-number.hmac", Date.now(), mockKeys);
      assert.equal(verified1, false);
      assert.equal(verified2, false);
      assert.equal(verified3, false);
    });
  });

  describe("bypass secret validation", () => {
    test("valid bypass secret passes", () => {
      const valid = isValidBypassSecret("test-secret-key-32-characters!", mockKeys);
      assert.equal(valid, true);
    });

    test("invalid bypass secret fails", () => {
      const invalid = isValidBypassSecret("wrong-secret-key", mockKeys);
      assert.equal(invalid, false);
    });

    test("empty bypass secret fails", () => {
      const empty = isValidBypassSecret("", mockKeys);
      assert.equal(empty, false);
    });

    test("null bypass secret fails", () => {
      const nullSecret = isValidBypassSecret(null, mockKeys);
      assert.equal(nullSecret, false);
    });

    test("undefined bypass secret fails", () => {
      const undefinedSecret = isValidBypassSecret(undefined, mockKeys);
      assert.equal(undefinedSecret, false);
    });

    test("timing-safe comparison: different length fails", () => {
      const tooShort = isValidBypassSecret("short", mockKeys);
      const tooLong = isValidBypassSecret("test-secret-key-32-characters!extra", mockKeys);
      assert.equal(tooShort, false);
      assert.equal(tooLong, false);
    });

    test("timing-safe comparison: one char off fails", () => {
      const almostCorrect = "test-secret-key-32-characters?"; // ? instead of !
      const result = isValidBypassSecret(almostCorrect, mockKeys);
      assert.equal(result, false);
    });
  });

  describe("cookie signature algorithm", () => {
    test("same timestamp still produces different cookies (random nonce)", () => {
      const now = Date.now();
      const signed1 = signBypassCookie(now, mockKeys);
      const signed2 = signBypassCookie(now, mockKeys);
      assert.notEqual(signed1, signed2);
      assert.equal(verifyBypassCookie(signed1, now, mockKeys), true);
      assert.equal(verifyBypassCookie(signed2, now, mockKeys), true);
    });

    test("a cookie issued in the future, or with a swapped nonce, fails", () => {
      const now = Date.now();
      assert.equal(verifyBypassCookie(signBypassCookie(now + 5 * 60_000, mockKeys), now, mockKeys), false);
      const [timestamp, , hmac] = signBypassCookie(now, mockKeys).split(".");
      assert.equal(verifyBypassCookie(`${timestamp}.${"x".repeat(22)}.${hmac}`, now, mockKeys), false);
    });

    test("different timestamps produce different signatures", () => {
      const now = Date.now();
      const later = now + 1000;
      const signed1 = signBypassCookie(now, mockKeys);
      const signed2 = signBypassCookie(later, mockKeys);
      assert.notEqual(signed1, signed2);
    });

    test("cookie format is timestamp.nonce.hmac", () => {
      const now = Date.now();
      const signed = signBypassCookie(now, mockKeys);
      const [timestamp, nonce, hmac] = signed.split(".");
      assert.equal(parseInt(timestamp, 10), now);
      assert.ok(nonce.length >= 16);
      assert.equal(hmac.length, 64); // SHA256 hex = 64 chars
    });
  });
});

describe("isMaintenanceExempt (proxy decision helper)", () => {
  test("admin pages are always exempt, bypass cookie or not", () => {
    assert.equal(isMaintenanceExempt("/admin", false), true);
    assert.equal(isMaintenanceExempt("/admin/settings", false), true);
    assert.equal(isMaintenanceExempt("/admin", true), true);
  });

  test("admin API is always exempt", () => {
    assert.equal(isMaintenanceExempt("/api/admin", false), true);
    assert.equal(isMaintenanceExempt("/api/admin/export/leads", false), true);
  });

  test("cron routes are always exempt", () => {
    assert.equal(isMaintenanceExempt("/api/cron", false), true);
    assert.equal(isMaintenanceExempt("/api/cron/blog-publish", false), true);
  });

  test("the health route is exempt, so the domain probe sees the site as up", () => {
    assert.equal(isMaintenanceExempt("/api/health", false), true);
    assert.equal(isMaintenanceExempt("/api/healthz", false), false);
  });

  test("a public path is exempt only with a valid bypass cookie", () => {
    assert.equal(isMaintenanceExempt("/", false), false);
    assert.equal(isMaintenanceExempt("/about", false), false);
    assert.equal(isMaintenanceExempt("/", true), true);
  });

  test("a path that merely starts with /admin as a prefix of another word is not exempt", () => {
    assert.equal(isMaintenanceExempt("/administrator", false), false);
  });
});
