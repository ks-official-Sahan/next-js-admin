import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "./constants";

// The session cookies as proxy.ts and the expire route see them (Better Auth
// here; lib/auth/config.ts gives Better Auth these names). No `server-only`
// import: proxy.ts reads this file too.

/** Better Auth's signed copy of the session, so most requests skip the token lookup. */
export const SESSION_DATA_COOKIE = `${SESSION_COOKIE}_data`;

/** Every cookie that holds the session, for the route that clears a revoked one. */
export const SESSION_COOKIES: readonly string[] = [SESSION_COOKIE, SESSION_DATA_COOKIE];

/** Optimistic check for proxy.ts: the cookie is present. The DAL makes the real check. */
export async function hasSessionCookie(request: NextRequest): Promise<boolean> {
  return Boolean(request.cookies.get(SESSION_COOKIE)?.value);
}
