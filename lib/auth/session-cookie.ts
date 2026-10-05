import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "./constants";

// The session cookie as proxy.ts and the expire route see it (next-auth here;
// the Better Auth variant swaps this file). No `server-only` import: proxy.ts
// reads this file too.

/** Every cookie that holds the session, for the route that clears a revoked one. */
export const SESSION_COOKIES: readonly string[] = [SESSION_COOKIE];

/** Optimistic check for proxy.ts: the JWT's signature and expiry only. The DAL makes the real check. */
export async function hasSessionCookie(request: NextRequest): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;
  try {
    const token = await getToken({ req: request, secret, cookieName: SESSION_COOKIE, salt: SESSION_COOKIE });
    return Boolean(token?.sid);
  } catch {
    return false;
  }
}
