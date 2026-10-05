import "server-only";

import { createAuthorize } from "@sahan-sac/auth-kit";
import { AUTH_KIT_DISABLED_PATHS, authKitDatabaseOptions, authKitSessions } from "@sahan-sac/auth-kit/better-auth";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { BETTER_AUTH_ORM, betterAuthDatabase } from "@/lib/data/better-auth";
import { siteUrl } from "@/lib/site-url";

import { SESSION_COOKIE } from "./constants";
import { AUTH_SECRET, PRODUCTION } from "./kit";
import { SESSION_DATA_COOKIE } from "./session-cookie";
import { signInDeps } from "./sign-in-deps";

// Better Auth on auth-kit's tables. auth-kit's authorize still decides who
// signs in (lockout, emailed MFA codes, known-device email, audit); Better
// Auth issues the session, a user_sessions row with a cookie token. No Better
// Auth route is mounted: server actions call auth.api directly, and
// AUTH_KIT_DISABLED_PATHS switches off every route that would sidestep
// auth-kit anyway. Only lib/auth/engine.ts imports this file.

const tables = authKitDatabaseOptions(BETTER_AUTH_ORM);

export const auth = betterAuth({
  baseURL: siteUrl(),
  secret: AUTH_SECRET,
  database: betterAuthDatabase,
  ...tables,
  advanced: {
    ...tables.advanced,
    // SESSION_COOKIE is already __Host- prefixed in production, so Better Auth
    // must not add its own __Secure- prefix; Secure is set explicitly instead.
    useSecureCookies: false,
    defaultCookieAttributes: { secure: PRODUCTION },
    cookies: { session_token: { name: SESSION_COOKIE }, session_data: { name: SESSION_DATA_COOKIE } },
  },
  disabledPaths: AUTH_KIT_DISABLED_PATHS,
  // nextCookies() writes Better Auth's cookies from server actions; it must stay last.
  plugins: [authKitSessions({ authorize: createAuthorize(signInDeps) }), nextCookies()],
});
