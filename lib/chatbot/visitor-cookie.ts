import { createHmac, randomBytes } from "crypto";

import { constantTimeEqual } from "@/lib/admin/login-unlock";

// Anonymous-visitor cookie for /api/chat's rate limiting fallback, used only
// when the caller's IP cannot be determined (R22: no TRUSTED_PROXY_HOPS, or
// off Vercel — every caller then shares UNKNOWN_IP, and the per-session limit
// alone would let one visitor open unlimited sessions for free by rotating
// sessionId). The cookie carries a random id and its own HMAC, signed with a
// secret only this server holds (passed in by the caller, per the app's
// "secrets are parameters" rule), so a client can discard the cookie to get a
// new id but cannot forge or predict one.

export const CHAT_VISITOR_COOKIE = "app_chat_vid";
const ID_BYTES = 16;
/** `<id>.<hmac>`, generous enough for the base64url id and a SHA-256 HMAC. */
const MAX_COOKIE_LENGTH = 256;

function mac(id: string, secret: string): string {
  return createHmac("sha256", secret).update(`chat-visitor:v1:${id}`).digest("base64url");
}

export function newChatVisitorId(): string {
  return randomBytes(ID_BYTES).toString("base64url");
}

export function signChatVisitorId(id: string, secret: string): string {
  return `${id}.${mac(id, secret)}`;
}

/** Returns the visitor id when the cookie's signature is valid, else null. */
export function verifyChatVisitorCookie(value: string | null | undefined, secret: string): string | null {
  if (!value || value.length > MAX_COOKIE_LENGTH) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || sig.length === 0) return null;
  if (!constantTimeEqual(sig, mac(id, secret))) return null;
  return id;
}

export function chatVisitorCookieOptions(production: boolean) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    // A long-lived per-visitor identifier, not a session: 180 days.
    maxAge: 60 * 60 * 24 * 180,
  };
}
