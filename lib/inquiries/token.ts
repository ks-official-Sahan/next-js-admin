import "server-only";

import { createHmac, randomBytes } from "crypto";
import { timingSafeEqual } from "crypto";

// Signed timing token with nonce for the contact form.
// Used by both /api/contact/token (issue) and /api/contact (verify).

const MIN_AGE_MS = 3000; // 3 seconds
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface TokenPayload {
  iat: number; // Issued at timestamp (milliseconds)
  nonce: string; // Random nonce to prevent guessing
}

export function issueToken(secret: string): string {
  const nonce = randomBytes(16).toString("hex");
  const payload: TokenPayload = { iat: Date.now(), nonce };
  const json = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(json).digest("base64url");
  return `${Buffer.from(json).toString("base64url")}.${sig}`;
}

export function verifyToken(token: string, secret: string, now: number = Date.now()): TokenPayload | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;

    const json = Buffer.from(payload, "base64url").toString("utf-8");
    const data = JSON.parse(json) as TokenPayload;

    // Verify signature with constant-time comparison
    const expectedSig = createHmac("sha256", secret).update(json).digest("base64url");
    if (sig.length !== expectedSig.length) return null; // Length check before timing-safe compare

    try {
      if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    } catch {
      return null;
    }

    // Check age window
    const age = now - data.iat;
    if (age < MIN_AGE_MS || age > MAX_AGE_MS) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}
