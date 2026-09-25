import { createHmac } from "crypto";
import { test } from "node:test";
import assert from "node:assert";

// Test the token signing/verification logic used in the API

const MIN_AGE_MS = 3000;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface TokenPayload {
  iat: number;
}

function signToken(payload: TokenPayload, secret: string): string {
  const json = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(json).digest("base64url");
  return `${Buffer.from(json).toString("base64url")}.${sig}`;
}

function verifyToken(token: string, secret: string, now: number = Date.now()): TokenPayload | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;

    const json = Buffer.from(payload, "base64url").toString("utf-8");
    const data = JSON.parse(json) as TokenPayload;

    const expectedSig = createHmac("sha256", secret).update(json).digest("base64url");
    if (sig !== expectedSig) return null;

    const age = now - data.iat;
    if (age < MIN_AGE_MS || age > MAX_AGE_MS) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

test("timing token", async (t) => {
  const secret = "test-secret-32-characters-long-";

  await t.test("valid token can be verified", () => {
    const now = Date.now();
    const token = signToken({ iat: now }, secret);
    const verified = verifyToken(token, secret, now + 10000); // 10 seconds later
    assert.ok(verified, "Token should verify");
    assert.strictEqual(verified?.iat, now);
  });

  await t.test("token too new is rejected", () => {
    const now = Date.now();
    const token = signToken({ iat: now }, secret);
    const verified = verifyToken(token, secret, now + 1000); // Only 1 second later
    assert.strictEqual(verified, null, "Token should be too new");
  });

  await t.test("token too old is rejected", () => {
    const now = Date.now();
    const token = signToken({ iat: now }, secret);
    const verified = verifyToken(token, secret, now + MAX_AGE_MS + 1000); // Past expiry
    assert.strictEqual(verified, null, "Token should be too old");
  });

  await t.test("tampered signature is rejected", () => {
    const now = Date.now();
    const token = signToken({ iat: now }, secret);
    const [payload, _sig] = token.split(".");
    const tamperedToken = `${payload}.tampered`;
    const verified = verifyToken(tamperedToken, secret, now + 10000);
    assert.strictEqual(verified, null, "Tampered token should not verify");
  });

  await t.test("wrong secret is rejected", () => {
    const now = Date.now();
    const token = signToken({ iat: now }, secret);
    const verified = verifyToken(token, "wrong-secret-32-characters-long-", now + 10000);
    assert.strictEqual(verified, null, "Token with wrong secret should not verify");
  });

  await t.test("token valid at 3 second boundary", () => {
    const now = Date.now();
    const token = signToken({ iat: now }, secret);
    const verified = verifyToken(token, secret, now + MIN_AGE_MS); // Exactly at boundary
    assert.ok(verified, "Token should verify at min age boundary");
  });

  await t.test("token valid at 2 hour boundary", () => {
    const now = Date.now();
    const token = signToken({ iat: now }, secret);
    const verified = verifyToken(token, secret, now + MAX_AGE_MS - 1000); // Just before expiry
    assert.ok(verified, "Token should verify just before expiry");
  });
});
