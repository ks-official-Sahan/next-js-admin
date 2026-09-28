import { createHmac } from "node:crypto";

import { constantTimeEqual } from "@sahan-sac/auth-kit/login-unlock";

// Maintenance bypass cookie: allows a developer to see the real site while
// maintenance mode is on. Similar to the unlock cookie pattern. Design:
// design notes, section 4.5 and Step 16.

const BYPASS_COOKIE = "app_maintenance_bypass";
const BYPASS_QUERY = "bypass-secret";
const BYPASS_COOKIE_MAX_AGE = 2 * 60 * 60; // 2 hours

export interface BypassCookieKeys {
  secret: string;
}

export interface CookieSerializeOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none";
  maxAge?: number;
  path?: string;
}

/**
 * Read the maintenance bypass secret from environment. Returns null when it
 * is not set, and then the bypass query and cookie are ignored entirely.
 */
export function bypassKeysFromEnv(env: Record<string, string | undefined> = process.env): BypassCookieKeys | null {
  const secret = env.MAINTENANCE_BYPASS_SECRET?.trim();
  if (!secret) return null;
  return { secret };
}

/**
 * Sign the bypass cookie with HMAC-SHA256. The signature covers
 * the timestamp and a constant prefix to prevent replays.
 */
export function signBypassCookie(timestamp: number, keys: BypassCookieKeys): string {
  const payload = `${timestamp}:bypass`;
  const hmac = createHmac("sha256", keys.secret).update(payload).digest("hex");
  return `${timestamp}.${hmac}`;
}

/**
 * Verify the bypass cookie. Returns true if the cookie is valid and not expired.
 */
export function verifyBypassCookie(
  cookieValue: string | undefined,
  now: number,
  keys: BypassCookieKeys
): boolean {
  if (!cookieValue) return false;

  const [timestampStr, hmac] = cookieValue.split(".");
  if (!timestampStr || !hmac) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Check expiry (2 hours)
  if (now - timestamp > BYPASS_COOKIE_MAX_AGE * 1000) return false;

  const expected = createHmac("sha256", keys.secret)
    .update(`${timestamp}:bypass`)
    .digest("hex");

  return constantTimeEqual(hmac, expected);
}

/**
 * Check if the provided bypass secret is valid.
 */
export function isValidBypassSecret(provided: string | null | undefined, keys: BypassCookieKeys): boolean {
  if (!provided) return false;
  return constantTimeEqual(provided, keys.secret);
}

/**
 * Cookie options for the bypass cookie. HttpOnly and secure in production.
 */
export function bypassCookieOptions(production: boolean): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    maxAge: BYPASS_COOKIE_MAX_AGE,
    path: "/",
  };
}

/**
 * Pure decision helper for proxy.ts responsibility 2 (design notes,
 * section 4.5): is this path exempt from the public maintenance page? Admin
 * pages, admin API and cron always are (so the operator can always turn
 * maintenance back off), and any request already carrying a verified bypass
 * cookie is. Extracted so the exemption rule can be unit tested without the
 * Next.js request/response types proxy.ts otherwise needs.
 */
export function isMaintenanceExempt(pathname: string, hasBypassCookie: boolean): boolean {
  if (hasBypassCookie) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname === "/api/admin" || pathname.startsWith("/api/admin/")) return true;
  if (pathname === "/api/cron" || pathname.startsWith("/api/cron/")) return true;
  return false;
}

export { BYPASS_COOKIE, BYPASS_QUERY };
