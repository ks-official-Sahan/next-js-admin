import "server-only";

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

const privateKey = text.transform((value) => value?.replace(/\\n/g, "\n"));

const emailProvider = text
  .transform((value) => (value ?? "auto").toLowerCase())
  .pipe(z.enum(["auto", "resend", "brevo-smtp", "capture"]));

export const DEFAULT_AI_MODELS = {
  OPENROUTER_MODEL: "google/gemma-4-31b-it:free",
  GEMINI_MODEL: "gemini-3.1-flash",
  VERTEX_MODEL: "gemini-3.1-flash",
  NVIDIA_MODEL: "meta/llama-3.3-70b-instruct",
  IMAGEN_MODEL: "gemini-3.1-flash-image",
} as const;

const schema = z.object({
  // Auth and signing
  AUTH_SECRET: text,
  AUTH_TRUST_HOST: flag,
  AUTH_DEBUG: flag,
  INTERNAL_SIGNING_SECRET: text,
  MEDIA_SIGNING_SECRET: text,
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
  CLOUDINARY_CLOUD_NAME: text,
  CLOUDINARY_API_KEY: text,
  CLOUDINARY_API_SECRET: text,
  CLOUDINARY_URL: text,

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

  // AI: model overrides with working defaults so all providers function out-of-the-box
  OPENROUTER_BASE_URL: text,
  OPENROUTER_API_KEY: text,
  OPENROUTER_API_KEY_2: text,
  OPENROUTER_ALLOW_PAID_MODELS: flag,
  OPENROUTER_MODEL: text.transform((v) => v || DEFAULT_AI_MODELS.OPENROUTER_MODEL),
  GEMINI_API_KEY: text,
  GEMINI_MODEL: text.transform((v) => v || DEFAULT_AI_MODELS.GEMINI_MODEL),
  NVIDIA_API_KEY: text,
  NVIDIA_MODEL: text.transform((v) => v || DEFAULT_AI_MODELS.NVIDIA_MODEL),
  VERTEX_MODEL: text.transform((v) => v || DEFAULT_AI_MODELS.VERTEX_MODEL),
  // Vertex AI Imagen model for the blog generator's featured/content images
  // (lib/ai/image.ts); reuses the same GOOGLE_* service account as VERTEX_MODEL.
  IMAGEN_MODEL: text.transform((v) => v || DEFAULT_AI_MODELS.IMAGEN_MODEL),
  GOOGLE_CLIENT_EMAIL: text,
  GOOGLE_PRIVATE_KEY: privateKey,
  GOOGLE_CLOUD_PROJECT: text,
  GOOGLE_TOKEN_URI: text,

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
