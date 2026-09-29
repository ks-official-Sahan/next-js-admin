import "server-only";

import { aiEnvSchema } from "@sahan-sac/ai-core/env";
import { mediaEnvSchema } from "@sahan-sac/media-kit/env";
import { z } from "zod";

import { splitList, type EnvSource } from "./env-rules";

// Typed, lazily parsed environment. Every variable is optional here so the
// public site builds and runs without the admin configured. What must be set
// in production is decided by env-rules.ts. Error messages name variables and
// never print values.

const text = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const flag = z
  .string()
  .optional()
  .transform((value) => ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase()));

const list = text.transform((value) => splitList(value));

const port = text.transform((value, ctx) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    ctx.addIssue({ code: "custom", message: "must be a port number" });
    return z.NEVER;
  }
  return parsed;
});

const emailProvider = text
  .transform((value) => (value ?? "auto").toLowerCase())
  .pipe(z.enum(["auto", "resend", "brevo-smtp", "capture"]));

const schema = z.object({
  // Auth and signing
  AUTH_SECRET: text,
  AUTH_TRUST_HOST: flag,
  AUTH_DEBUG: flag,
  INTERNAL_SIGNING_SECRET: text,
  MAINTENANCE_BYPASS_SECRET: text,
  ADMIN_LOGIN_UNLOCK_SECRET: text,
  CRON_SECRET: text,
  ADMIN_EMAIL: text,
  ADMIN_NAME: text,
  ADMIN_PASSWORD: text,
  SITE_URL: text,
  ADMIN_ALLOWED_ORIGINS: list,

  // Data
  DATABASE_URL: text,
  DIRECT_DATABASE_URL: text,
  UPSTASH_REDIS_REST_URL: text,
  UPSTASH_REDIS_REST_TOKEN: text,
  // Unset: use Redis when both Upstash variables are valid. false/0/off: always in-memory.
  REDIS_ENABLED: text,

  // Media (Cloudinary + signed delivery URLs): one schema shared with every
  // @sahan-sac media package, so variable names and defaults never drift.
  ...mediaEnvSchema.shape,

  // Email
  EMAIL_PROVIDER: emailProvider,
  RESEND_API_KEY: text,
  RESEND_SENDER_EMAIL: text,
  RESEND_SENDER_NAME: text,
  RESEND_RECIPIENT_EMAILS: list,
  RESEND_CC_EMAILS: list,
  RESEND_BCC_EMAILS: list,
  EMAIL_HOST: text,
  EMAIL_PORT: port,
  EMAIL_USE_TLS: flag,
  EMAIL_HOST_USER: text,
  EMAIL_HOST_PASSWORD: text,
  DEFAULT_FROM_EMAIL: text,
  EMAIL_SENDER_USER: text,
  EMAIL_BREVO_API_KEY: text,

  // AI (blog assistant, chatbot, images): one schema shared with every
  // @sahan-sac AI package, so variable names and defaults never drift.
  ...aiEnvSchema.shape,

  // SEO: IndexNow ping and Bing Webmaster diagnostics
  INDEXNOW_KEY: text,
  BING_API_KEY: text,
});

export type AppEnv = z.infer<typeof schema>;

export function parseEnv(source: EnvSource): AppEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "?")))];
    throw new Error(`Invalid environment variables: ${names.join(", ")}`);
  }
  return result.data;
}

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  cachedEnv ??= parseEnv(process.env);
  return cachedEnv;
}

/** Test helper: forget the parsed environment. */
export function resetEnvCache(): void {
  cachedEnv = undefined;
}

/** `env.AUTH_SECRET` and friends, parsed on first access. */
export const env: AppEnv = new Proxy({} as AppEnv, {
  get(_target, property) {
    return getEnv()[property as keyof AppEnv];
  },
});
