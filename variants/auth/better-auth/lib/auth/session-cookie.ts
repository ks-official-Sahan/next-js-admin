import { createSessionCookieCheck } from "@sahan-sac/auth-kit/engines/better-auth/cookie";

import { SESSION_COOKIE } from "./constants";

// The session cookies as proxy.ts and the expire route see them, for the
// engine lib/auth/engine.ts uses (change both imports together). No
// `server-only` import: proxy.ts reads this file too.

export const { sessionCookies: SESSION_COOKIES, hasSessionCookie } = createSessionCookieCheck({
  cookieName: SESSION_COOKIE,
  secret: process.env.AUTH_SECRET,
});
