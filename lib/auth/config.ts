import "server-only";

import { createAuthConfig, createMfa, ensureBootstrapOwner } from "@sahan-sac/auth-kit";
import { createSessionStore } from "@sahan-sac/auth-kit/session";
import NextAuth from "next-auth";
import { after } from "next/server";

import { auditSafe } from "@/lib/admin/audit";
import { limit, LIMITS } from "@/lib/cache/ratelimit";
import { kv } from "@/lib/cache/redis";
import { db } from "@/lib/db/prisma";
import { seedOwner } from "@/lib/db/seed";
import { sendEmail } from "@/lib/email";
import { mfaCode, newLogin } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";

import { AUTH_SECRET, PRODUCTION } from "./kit";
import { authKit } from "./kit-config";
import { prismaAuthAdapter } from "./prisma-adapter";

// Built once per module load; deps only ever wrap already-configured app
// singletons (db, kv, env), so there is nothing request-scoped to defer here.

const env = getEnv();

// auth-kit's deps declare `limit`/`sendEmail` with the loose (bucket: string,
// message: { category: string }) shapes any app could have; the app's own
// versions are typed against its specific bucket names and email categories,
// so they are narrower than what a generic function-typed dep can accept
// structurally. The buckets and categories the package actually calls with
// (below) are always members of the app's own literal unions.
const limitAdapter = (bucket: string, key: string) => limit(bucket as Parameters<typeof limit>[0], key);
const sendEmailAdapter = (
  message: { to: string; subject: string; html: string; text: string; category: string },
  context: { actor: { id: string; email: string } }
) => sendEmail(message as Parameters<typeof sendEmail>[0], context);

const sessionStoreImpl = createSessionStore({ adapter: prismaAuthAdapter, kv, authSecret: AUTH_SECRET });
const mfaImpl = createMfa({
  adapter: prismaAuthAdapter,
  authSecret: AUTH_SECRET,
  limit: limitAdapter,
  sendEmail: sendEmailAdapter,
  audit: auditSafe,
  renderMfaCode: mfaCode,
});
const bootstrap = () => ensureBootstrapOwner(prismaAuthAdapter, () => seedOwner(db, process.env, "bootstrap"), log);

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth(() =>
  createAuthConfig({
    adapter: prismaAuthAdapter,
    authSecret: AUTH_SECRET,
    keyPrefix: authKit.keyPrefix,
    sessionCookieName: authKit.sessionCookieName(PRODUCTION),
    loginPath: authKit.paths.login,
    defaultRole: authKit.superRole,
    authTrustHost: env.AUTH_TRUST_HOST,
    authDebug: env.AUTH_DEBUG,
    production: PRODUCTION,
    sessionStore: sessionStoreImpl,
    mfa: mfaImpl,
    after,
    bootstrap,
    loginFailureWindowSeconds: LIMITS["login:acct"].windowSeconds,
    loginFailureMaxAttempts: LIMITS["login:acct"].max,
    limit: limitAdapter,
    failures: {
      reserve: (key, windowSeconds) => kv.incr(key, windowSeconds),
      clear: (key) => kv.del(key).then(() => undefined),
    },
    audit: auditSafe,
    warn: (message, fields) => log.warn(message, fields),
    sendKnownDeviceEmail: async (input) => {
      const rendered = newLogin({ name: input.name, ip: input.ip, browser: input.browser, os: input.os, when: new Date().toUTCString() });
      await sendEmail(
        { to: input.email, subject: rendered.subject, html: rendered.html, text: rendered.text, category: "security" },
        { actor: { id: input.userId, email: input.email } }
      );
    },
  })
);
