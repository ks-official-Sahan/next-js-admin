import "server-only";

import { createAuthConfig } from "@sahan-sac/auth-kit";
import NextAuth from "next-auth";

import { getEnv } from "@/lib/env";

import { PRODUCTION } from "./kit";
import { authKit } from "./kit-config";
import { signInDeps } from "./sign-in-deps";

// next-auth with auth-kit's credentials provider. Only lib/auth/engine.ts
// imports this file; everything else goes through the engine functions there.

const env = getEnv();

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth(() =>
  createAuthConfig({
    ...signInDeps,
    sessionCookieName: authKit.sessionCookieName(PRODUCTION),
    loginPath: authKit.paths.login,
    defaultRole: authKit.superRole,
    authTrustHost: env.AUTH_TRUST_HOST,
    authDebug: env.AUTH_DEBUG,
    production: PRODUCTION,
  })
);
