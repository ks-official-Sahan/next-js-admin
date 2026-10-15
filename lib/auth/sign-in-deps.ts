import "server-only";

import { ensureBootstrapOwner, type AuthorizeDeps } from "@sahan-sac/auth-kit";
import { createSessionStore } from "@sahan-sac/auth-kit/session";
import { after } from "next/server";

import { auditSafe } from "@/lib/admin/audit";
import { limit, LIMITS } from "@/lib/cache/ratelimit";
import { kv } from "@/lib/cache/redis";
import { authAdapter, repos } from "@/lib/data";
import { seedOwner } from "@/lib/db/seed";
import { sendEmail } from "@/lib/email";
import { newLogin } from "@/lib/email/templates";
import { log } from "@/lib/log";

import { AUTH_SECRET } from "./kit";
import { authKit } from "./kit-config";
import { mfa } from "./mfa";

// Everything auth-kit's sign-in decision (createAuthorize) needs, whichever
// engine runs it: next-auth's credentials provider (config.ts) or the Better
// Auth variant's authKitSessions plugin. Built once per module load; the deps
// only wrap already-configured app singletons (db, kv, env).

// auth-kit's deps declare `limit`/`sendEmail` with the loose (bucket: string,
// message: { category: string }) shapes any app could have; the app's own
// versions are typed against its specific bucket names and email categories,
// so they are narrower than what a generic function-typed dep can accept
// structurally. The buckets and categories the package actually calls with
// are always members of the app's own literal unions.
const limitAdapter = (bucket: string, key: string) => limit(bucket as Parameters<typeof limit>[0], key);

export const signInDeps: AuthorizeDeps = {
  adapter: authAdapter,
  authSecret: AUTH_SECRET,
  keyPrefix: authKit.keyPrefix,
  sessionStore: createSessionStore({ adapter: authAdapter, kv, authSecret: AUTH_SECRET }),
  mfa,
  after,
  bootstrap: () => ensureBootstrapOwner(authAdapter, () => seedOwner(repos, process.env, "bootstrap"), log),
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
};
