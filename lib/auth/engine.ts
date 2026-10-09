import "server-only";

import { createAuthEngine } from "@sahan-sac/auth-kit/engines/next-auth";

import { authDatabase } from "@/lib/data";
import { getEnv } from "@/lib/env";
import { siteOrigins } from "@/lib/site-url";

import { SESSION_COOKIE } from "./constants";
import { PRODUCTION } from "./kit";
import { authKit } from "./kit-config";
import { signInDeps } from "./sign-in-deps";

// The one place server code meets the auth engine (next-auth here). Server
// actions, the data access layer and routes call these and never the engine
// itself. To switch engines, run `npx auth-kit engine better-auth --write`: it
// points this import and the one in session-cookie.ts at the other engine
// (same options) and prints the dependency swap. The database stays as it
// is: both engines use the same tables.

export const engine = createAuthEngine({
  signIn: signInDeps,
  database: authDatabase,
  production: PRODUCTION,
  sessionCookieName: SESSION_COOKIE,
  loginPath: authKit.paths.login,
  defaultRole: authKit.superRole,
  // Every site domain, plus preview or local origins the proxy already allows.
  origins: [...siteOrigins(), ...getEnv().ADMIN_ALLOWED_ORIGINS],
});

export const {
  sessionSource,
  checkPasswordFingerprint,
  signIn: attemptSignIn,
  signOut: signOutAndRedirect,
  keepSessionAfterPasswordChange,
} = engine;
