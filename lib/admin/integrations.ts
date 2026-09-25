import "server-only";

import { db } from "@/lib/db/prisma";
import { kv, kvBackend } from "@/lib/cache/redis";
import { log } from "@/lib/log";
import { checkIndexNowKeyFile } from "@/lib/seo/indexnow";

// Integration health for the settings screen: configured yes/no, plus a
// cheap live ping through an injectable fetch with a short timeout. Never
// returns a secret value or a fragment of one, only booleans and the
// human-readable name of the integration. Design notes,
// Step 16.

export interface IntegrationStatus {
  name: string;
  /** Environment variables for this integration are present. */
  configured: boolean;
  /**
   * Live reachability: true/false when pinged, null when not pinged (not
   * configured, or the integration has no cheap ping — the database and
   * Redis checks always ping because they are already on the request path).
   */
  reachable: boolean | null;
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

export async function checkDatabase(): Promise<IntegrationStatus> {
  const configured = Boolean(process.env.DATABASE_URL);
  if (!configured) return { name: "Database", configured, reachable: null };
  try {
    await db.$queryRawUnsafe("SELECT 1");
    return { name: "Database", configured, reachable: true };
  } catch (err) {
    log.warn("integration health: database ping failed", { error: String(err) });
    return { name: "Database", configured, reachable: false };
  }
}

export async function checkRedis(): Promise<IntegrationStatus> {
  const configured = kvBackend() === "upstash";
  if (!configured) return { name: "Redis", configured, reachable: null };
  try {
    const probeKey = "health:ping";
    await kv.set(probeKey, Date.now(), { ttlSeconds: 30 });
    const value = await kv.get(probeKey);
    return { name: "Redis", configured, reachable: value !== null };
  } catch (err) {
    log.warn("integration health: redis ping failed", { error: String(err) });
    return { name: "Redis", configured, reachable: false };
  }
}

export async function checkResend(fetchImpl: FetchLike = fetch): Promise<IntegrationStatus> {
  const apiKey = process.env.RESEND_API_KEY;
  const configured = Boolean(apiKey);
  if (!configured) return { name: "Resend", configured, reachable: null };
  try {
    const response = await fetchImpl("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    if (response.ok) return { name: "Resend", configured, reachable: true };
    // A send-only scoped API key correctly 401s on /domains with this error
    // name: Resend recognized the key, it is just narrower than this ping
    // needs. That is a valid, working key, not an unreachable integration.
    const body = (await response.json().catch(() => null)) as { name?: string } | null;
    const scopedButValid = response.status === 401 && body?.name === "restricted_api_key";
    return { name: "Resend", configured, reachable: scopedButValid };
  } catch {
    return { name: "Resend", configured, reachable: false };
  }
}

export async function checkBrevo(fetchImpl: FetchLike = fetch): Promise<IntegrationStatus> {
  const apiKey = process.env.EMAIL_BREVO_API_KEY;
  const configured = Boolean(apiKey);
  if (!configured) return { name: "Brevo", configured, reachable: null };
  const reachable = await pingUrl(fetchImpl, "https://api.brevo.com/v3/account", {
    headers: { "api-key": apiKey as string },
  });
  return { name: "Brevo", configured, reachable };
}

export async function checkCloudinary(fetchImpl: FetchLike = fetch): Promise<IntegrationStatus> {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  const configured = Boolean(cloud && key && secret);
  if (!configured) return { name: "Cloudinary", configured, reachable: null };
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const reachable = await pingUrl(fetchImpl, `https://api.cloudinary.com/v1_1/${cloud}/resources/image?max_results=1`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return { name: "Cloudinary", configured, reachable };
}

export async function checkOpenRouter(fetchImpl: FetchLike = fetch): Promise<IntegrationStatus> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const configured = Boolean(apiKey);
  if (!configured) return { name: "OpenRouter (AI)", configured, reachable: null };
  const reachable = await pingUrl(fetchImpl, "https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return { name: "OpenRouter (AI)", configured, reachable };
}

export async function checkGemini(): Promise<IntegrationStatus> {
  // Configured-only: pinging costs a quota unit against a paid API for a
  // screen that just wants a yes/no.
  return { name: "Gemini (AI)", configured: Boolean(process.env.GEMINI_API_KEY), reachable: null };
}

export async function checkNvidia(): Promise<IntegrationStatus> {
  return { name: "NVIDIA (AI)", configured: Boolean(process.env.NVIDIA_API_KEY), reachable: null };
}

export async function checkIndexNow(): Promise<IntegrationStatus> {
  const result = await checkIndexNowKeyFile();
  return { name: "IndexNow", configured: result.configured, reachable: result.configured ? result.ok : null };
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
    checkOpenRouter(fetchImpl),
    checkGemini(),
    checkNvidia(),
    checkIndexNow(),
  ];
  const results = await Promise.allSettled(checks);
  return results.map((result, index) =>
    result.status === "fulfilled" ? result.value : { name: INTEGRATION_NAMES[index], configured: false, reachable: false }
  );
}

const INTEGRATION_NAMES = [
  "Database",
  "Redis",
  "Resend",
  "Brevo",
  "Cloudinary",
  "OpenRouter (AI)",
  "Gemini (AI)",
  "NVIDIA (AI)",
  "IndexNow",
];
