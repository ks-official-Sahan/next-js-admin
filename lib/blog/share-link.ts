import { createHmac } from "node:crypto";

import { constantTimeEqual } from "@sahan-sac/auth-kit/login-unlock";

// Signed share links for previewing a post before it is public: a token is
// `<expiry ms>.<HMAC-SHA256 of the post id and expiry>`, valid only for that
// post until it expires. Nothing is stored, so a link cannot be revoked one
// by one; rotating AUTH_SECRET (or the derived key's label) voids them all.
// Pure: the caller resolves the key (deriveShareKey(env.AUTH_SECRET)).

/** Lifetimes the editor offers, in days. */
export const SHARE_LINK_DAYS = [1, 7, 30] as const;
export type ShareLinkDays = (typeof SHARE_LINK_DAYS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** A key for share links only, so a token can never double as any other AUTH_SECRET signature. */
export function deriveShareKey(authSecret: string): string {
  return createHmac("sha256", authSecret).update("app:post-share-link:v1").digest("base64url");
}

const mac = (postId: string, expiresAt: number, key: string): string =>
  createHmac("sha256", key).update(`${postId}:${expiresAt}`).digest("base64url");

export function signShareToken(postId: string, expiresAt: number, key: string): string {
  return `${expiresAt}.${mac(postId, expiresAt, key)}`;
}

export function shareExpiry(days: ShareLinkDays, now = Date.now()): number {
  return now + days * DAY_MS;
}

/** True when `token` was signed for `postId` with `key` and has not expired. */
export function verifyShareToken(postId: string, token: string | null | undefined, key: string, now = Date.now()): boolean {
  if (!token) return false;
  const [expiry, signature, extra] = token.split(".");
  if (extra !== undefined || !expiry || !signature || !/^\d{13}$/.test(expiry)) return false;
  const expiresAt = Number(expiry);
  if (expiresAt <= now || expiresAt - now > 31 * DAY_MS) return false;
  return constantTimeEqual(signature, mac(postId, expiresAt, key));
}
