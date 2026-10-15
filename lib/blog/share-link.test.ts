import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveShareKey, shareExpiry, signShareToken, verifyShareToken } from "./share-link";

const key = deriveShareKey("test-auth-secret-at-least-32-chars-long");
const now = Date.parse("2026-10-10T10:00:00.000Z");

test("a token verifies for its post until it expires", () => {
  const token = signShareToken("post-1", shareExpiry(7, now), key);
  assert.equal(verifyShareToken("post-1", token, key, now), true);
  assert.equal(verifyShareToken("post-1", token, key, shareExpiry(7, now) + 1), false);
});

test("a token is refused for another post, another key, or when tampered", () => {
  const token = signShareToken("post-1", shareExpiry(1, now), key);
  assert.equal(verifyShareToken("post-2", token, key, now), false);
  assert.equal(verifyShareToken("post-1", token, deriveShareKey("another-secret-at-least-32-characters"), now), false);
  const [expiry, signature] = token.split(".");
  assert.equal(verifyShareToken("post-1", `${Number(expiry) + 1000}.${signature}`, key, now), false);
  assert.equal(verifyShareToken("post-1", `${token}.x`, key, now), false);
  assert.equal(verifyShareToken("post-1", null, key, now), false);
});

test("a token dated further out than any offered lifetime is refused", () => {
  const token = signShareToken("post-1", now + 60 * 24 * 60 * 60 * 1000, key);
  assert.equal(verifyShareToken("post-1", token, key, now), false);
});

test("the share key differs from the secret it is derived from", () => {
  assert.notEqual(key, "test-auth-secret-at-least-32-chars-long");
});
