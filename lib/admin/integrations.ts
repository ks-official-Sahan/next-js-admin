import "server-only";

import { BUILTIN_ADAPTERS, providerStatuses } from "@sahan-sac/ai-core/adapters";

import { repos } from "@/lib/data";
import { getEnv } from "@/lib/env";
import { kvBackend, pingRedis } from "@/lib/cache/redis";
import { log } from "@/lib/log";
import { checkIndexNowKeyFile } from "@/lib/seo/indexnow";

// Integration health for the settings screen: configured yes/no, plus a
// cheap live ping through an injectable fetch with a short timeout. AI
// providers are never pinged here: their only real check is a prompt, which
// spends tokens, so each AI row carries a `check` id for the manual Check
// button (lib/actions/integrations.ts). Never
// returns a secret value or a fragment of one, only booleans and the
// human-readable name of the integration. Design notes,
// Step 16.

export type IntegrationGroup = "Core" | "Email" | "Media" | "AI" | "SEO";

export interface IntegrationStatus {
  name: string;
  group: IntegrationGroup;
  /** What makes it configured and what the check does: environment variable names only, never values. */
  hint: string;
  /** Environment variables for this integration are present. */
  configured: boolean;
  /**
   * Live reachability: true/false when pinged, null when not pinged (not
   * configured, or the integration has no cheap ping — the database and
   * Redis checks always ping because they are already on the request path).
   */
  reachable: boolean | null;
  /** Manual check id for an AI row: an ai-core adapter id, or chain:blog / chain:chat. */
  check?: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const PING_TIMEOUT_MS = 2500;

async function pingUrl(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<boolean> {
  try {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    return response.ok;
  } catch {
    return false;
  }
}

const DATABASE = { name: "Database", group: "Core", hint: "DATABASE_URL. Checked with SELECT 1." } as const;
const REDIS = { name: "Redis", group: "Core", hint: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Checked by writing and reading a 30 s probe key." } as const;
const RESEND = { name: "Resend", group: "Email", hint: "RESEND_API_KEY. Checked against the domains API; a send-only key also counts as reachable." } as const;
const BREVO = { name: "Brevo", group: "Email", hint: "EMAIL_BREVO_API_KEY. Checked against the account API." } as const;
const CLOUDINARY = {
  name: "Cloudinary",
  group: "Media",
  hint: "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET. Checked by listing one image.",
} as const;
const AI_CHAIN = { name: "AI chain", group: "AI", hint: "" } as const;
const INDEXNOW = { name: "IndexNow", group: "SEO", hint: "INDEXNOW_KEY and its public key file. Checked by fetching the key file." } as const;

export async function checkDatabase(): Promise<IntegrationStatus> {
  const configured = Boolean(process.env.DATABASE_URL);
  if (!configured) return { ...DATABASE, configured, reachable: null };
  try {
    await repos.maintenance.ping();
    return { ...DATABASE, configured, reachable: true };
  } catch (err) {
    log.warn("integration health: database ping failed", { error: String(err) });
    return { ...DATABASE, configured, reachable: false };
  }
}

export async function checkRedis(): Promise<IntegrationStatus> {
  const configured = kvBackend() !== "memory";
  if (!configured) return { ...REDIS, configured, reachable: null };
  try {
    return { ...REDIS, configured, reachable: await pingRedis() };
  } catch (err) {
    log.warn("integration health: redis ping failed", { error: String(err) });
    return { ...REDIS, configured, reachable: false };
  }
}

export async function checkResend(fetchImpl: FetchLike = fetch): Promise<IntegrationStatus> {
  const apiKey = process.env.RESEND_API_KEY;
  const configured = Boolean(apiKey);
  if (!configured) return { ...RESEND, configured, reachable: null };
  try {
    const response = await fetchImpl("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    if (response.ok) return { ...RESEND, configured, reachable: true };
    // A send-only scoped API key correctly 401s on /domains with this error
    // name: Resend recognized the key, it is just narrower than this ping
    // needs. That is a valid, working key, not an unreachable integration.
    const body = (await response.json().catch(() => null)) as { name?: string } | null;
    const scopedButValid = response.status === 401 && body?.name === "restricted_api_key";
    return { ...RESEND, configured, reachable: scopedButValid };
  } catch {
    return { ...RESEND, configured, reachable: false };
  }
}

export async function checkBrevo(fetchImpl: FetchLike = fetch): Promise<IntegrationStatus> {
  const apiKey = process.env.EMAIL_BREVO_API_KEY;
  const configured = Boolean(apiKey);
  if (!configured) return { ...BREVO, configured, reachable: null };
  const reachable = await pingUrl(fetchImpl, "https://api.brevo.com/v3/account", {
    headers: { "api-key": apiKey as string },
  });
  return { ...BREVO, configured, reachable };
}

export async function checkCloudinary(fetchImpl: FetchLike = fetch): Promise<IntegrationStatus> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  const configured = Boolean(cloud && key && secret);
  if (!configured) return { ...CLOUDINARY, configured, reachable: null };
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const reachable = await pingUrl(fetchImpl, `https://api.cloudinary.com/v1_1/${cloud}/resources/image?max_results=1`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return { ...CLOUDINARY, configured, reachable };
}

const AI_VARS: Record<string, string> = {
  gemini: "GEMINI_API_KEY.",
  openrouter: "OPENROUTER_API_KEY. Free models only, unless OPENROUTER_ALLOW_PAID_MODELS=true.",
  "openrouter-2": "OPENROUTER_API_KEY_2: a second OpenRouter key, tried after the first.",
  nvidia: "NVIDIA_API_KEY.",
  openai: "OPENAI_API_KEY (OPENAI_BASE_URL for a compatible gateway).",
  anthropic: "ANTHROPIC_API_KEY.",
  deepseek: "DEEPSEEK_API_KEY.",
  xai: "XAI_API_KEY.",
  perplexity: "PERPLEXITY_API_KEY.",
  custom: "AI_CUSTOM_BASE_URL and AI_CUSTOM_MODEL (AI_CUSTOM_API_KEY optional). Paid unless AI_CUSTOM_FREE=true.",
  vertex: "GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_CLOUD_PROJECT.",
};
const ON_DEMAND = "Not checked automatically: Check sends a one-line prompt, which spends a few tokens.";

/**
 * One row per ai-core adapter, configured when its variables are present
 * (the adapter's own `missing()`, so this list never drifts from the chain).
 * No network: reachability is the manual Check.
 */
export function checkAiProviders(): IntegrationStatus[] {
  const env = getEnv();
  return BUILTIN_ADAPTERS.map((adapter) => {
    const vars = AI_VARS[adapter.id] ?? "";
    const paid = adapter.paid(env) ? "In the chain only while AI_ALLOW_PAID=true." : "";
    return {
      name: adapter.label,
      group: "AI",
      hint: [vars, paid, ON_DEMAND].filter(Boolean).join(" "),
      configured: adapter.missing(env).length === 0,
      reachable: null,
      check: adapter.id,
    };
  });
}

/**
 * Which providers each AI chain tries, in order (@sahan-sac/ai-core/adapters):
 * set by AI_PROVIDER_ORDER(_BLOG|_CHAT), filtered by keys and AI_ALLOW_PAID.
 * No network: a provider that fails at request time hands over to the next.
 */
export function checkAiChains(): IntegrationStatus[] {
  const env = getEnv();
  return (["blog", "chat"] as const).map((purpose) => {
    const statuses = providerStatuses(env, purpose);
    const active = statuses.filter((status) => status.state === "active").map((status) => status.id);
    const waiting = statuses.filter((status) => status.state === "needs_paid").map((status) => status.id);
    const unknown = statuses.filter((status) => status.state === "unknown").map((status) => status.id);
    const parts = [
      active.length ? `Tries ${active.join(" → ")}, each failure falling through to the next.` : "No provider can answer.",
      waiting.length ? `Configured but paid, off until AI_ALLOW_PAID=true: ${waiting.join(", ")}.` : "",
      unknown.length ? `Unknown ids in the order: ${unknown.join(", ")}.` : "",
      `Order: AI_PROVIDER_ORDER_${purpose.toUpperCase()} or AI_PROVIDER_ORDER.`,
    ];
    return {
      ...AI_CHAIN,
      name: `AI chain (${purpose})`,
      hint: [...parts, "Check runs the whole chain once, as a real request would."].filter(Boolean).join(" "),
      configured: active.length > 0,
      reachable: null,
      check: `chain:${purpose}`,
    };
  });
}

export async function checkIndexNow(): Promise<IntegrationStatus> {
  const result = await checkIndexNowKeyFile();
  return { ...INDEXNOW, configured: result.configured, reachable: result.configured ? result.ok : null };
}

/**
 * Every integration's status, each check isolated so one failure (a timeout,
 * a thrown error) never hides the others. `fetchImpl` is injectable for
 * tests; production callers omit it and get the global fetch.
 */
export async function getIntegrationHealth(fetchImpl: FetchLike = fetch): Promise<IntegrationStatus[]> {
  const checks = [
    checkDatabase(),
    checkRedis(),
    checkResend(fetchImpl),
    checkBrevo(fetchImpl),
    checkCloudinary(fetchImpl),
    checkIndexNow(),
  ];
  const results = await Promise.allSettled(checks);
  const statuses = results.map((result, index) =>
    result.status === "fulfilled" ? result.value : { ...INTEGRATIONS[index], configured: false, reachable: false }
  );
  let ai: IntegrationStatus[];
  try {
    ai = [...checkAiProviders(), ...checkAiChains()];
  } catch (err) {
    // An invalid AI variable fails the env parse: say so instead of hiding the group.
    log.warn("integration health: AI env invalid", { error: String(err) });
    ai = [{ ...AI_CHAIN, hint: "The AI environment variables do not parse. Check the server log.", configured: false, reachable: false }];
  }
  return [...statuses, ...ai];
}

const INTEGRATIONS = [DATABASE, REDIS, RESEND, BREVO, CLOUDINARY, INDEXNOW];

const HEALTH_TTL_MS = 60_000;
let healthCache: { at: number; value: Promise<IntegrationStatus[]> } | null = null;

/**
 * getIntegrationHealth for the settings screen: one run per minute per server
 * instance, shared by concurrent requests, so reloading the page never fans
 * out a burst of pings to every provider. A run that throws is not kept.
 */
export function getCachedIntegrationHealth(now = Date.now()): Promise<IntegrationStatus[]> {
  if (healthCache && now - healthCache.at < HEALTH_TTL_MS) return healthCache.value;
  const value = getIntegrationHealth().catch((error: unknown) => {
    healthCache = null;
    throw error;
  });
  healthCache = { at: now, value };
  return value;
}
