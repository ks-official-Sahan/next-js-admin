import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

import { DEFAULT_AI_MODELS, type AppEnv } from "@/lib/env";
import { log } from "@/lib/log";

import type { ModelPrompt } from "./guard";
import { getVertexAccessToken } from "./vertex";

// An injectable, ordered provider chain, in the style of lib/email/service.ts
// (design notes, decision D15: OpenRouter, then Gemini, then
// NVIDIA, then Google Vertex AI as the final fallback; paid OpenRouter
// models off by default). Every provider here is a
// thin adapter: the fallback logic in createAiService() is pure and unit
// tested with fakes, and real network calls only happen through
// realProviders(), which this agent never calls in a test.

export type AiOutcome =
  | { ok: true; text: string }
  | { ok: false; errorClass: string; retryable: boolean; status?: number };

export interface AiGenerateOptions {
  maxTokens?: number;
  /** Aborted when the attempt times out, so a slow provider stops consuming a socket. */
  signal?: AbortSignal;
  /** When true, providers that support it (Gemini) will request JSON output. */
  jsonMode?: boolean;
}

export interface AiProvider {
  readonly name: string;
  generate(prompt: ModelPrompt, options?: AiGenerateOptions): Promise<AiOutcome>;
}

export interface AiAttempt {
  provider: string;
  ok: boolean;
  errorClass?: string;
  ms: number;
}

export interface AiResult {
  ok: boolean;
  provider: string | null;
  text?: string;
  errorClass?: string;
  attempts: AiAttempt[];
}

export const AI_TIMEOUT_MS = 25_000;
/** A provider that timed out or was rate limited goes to the back of the line for this long. */
export const AI_COOLDOWN_MS = 60_000;

async function attempt(
  provider: AiProvider,
  prompt: ModelPrompt,
  maxTokens: number | undefined,
  ms: number,
  cancel: AbortSignal,
  jsonMode?: boolean
): Promise<AiOutcome> {
  const controller = new AbortController();
  const onCancel = () => controller.abort();
  cancel.addEventListener("abort", onCancel, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AiOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, errorClass: "timeout", retryable: true });
    }, ms);
  });
  try {
    return await Promise.race([provider.generate(prompt, { maxTokens, signal: controller.signal, jsonMode }), timeout]);
  } catch {
    return { ok: false, errorClass: "transport", retryable: true };
  } finally {
    clearTimeout(timer);
    cancel.removeEventListener("abort", onCancel);
  }
}

/** What the chain has learned about each provider: when it may lead again, and how fast it answers. */
export interface AiHealth {
  cooldownUntil: Map<string, number>;
  latencyMs: Map<string, number>;
}

export const createAiHealth = (): AiHealth => ({ cooldownUntil: new Map(), latencyMs: new Map() });

/** One per server instance, for request handlers; tests and scripts get a fresh one by default. */
export const sharedAiHealth: AiHealth = ((globalThis as unknown as { appAiHealth?: AiHealth }).appAiHealth ??= createAiHealth());

/** Quota and slowness pass quickly; a wrong key or a retired model needs an operator, so it cools longer. */
function cooldownFor(outcome: AiOutcome): number {
  if (outcome.ok) return 0;
  if (outcome.errorClass === "timeout" || outcome.status === 429) return AI_COOLDOWN_MS;
  if (outcome.status === 401 || outcome.status === 403 || outcome.status === 404) return AI_COOLDOWN_MS * 10;
  return 0;
}

export interface AiServiceDeps {
  providers: readonly AiProvider[];
  /** Per-provider attempt budget. */
  timeoutMs?: number;
  /** Whole-chain budget; the remaining time caps each later attempt. */
  deadlineMs?: number;
  /**
   * Hedged requests: when the running attempt has not answered after this
   * long, the next provider starts too and the first success wins (the
   * others are aborted). Off by default, so attempts run one at a time.
   */
  hedgeAfterMs?: number;
  health?: AiHealth;
  now?: () => number;
}

const HEDGE = Symbol("hedge");

/**
 * Tries providers until one succeeds, a non-retryable failure stops the chain,
 * or the deadline passes. Healthy providers lead, fastest observed first;
 * cooling ones go last instead of being dropped, so a request always gets a
 * real attempt even when every provider is cooling.
 */
export function createAiService(deps: AiServiceDeps) {
  const timeoutMs = deps.timeoutMs ?? AI_TIMEOUT_MS;
  const now = deps.now ?? Date.now;
  const health = deps.health ?? createAiHealth();

  function rank(at: number): AiProvider[] {
    const cooling = (p: AiProvider) => Number((health.cooldownUntil.get(p.name) ?? 0) > at);
    const speed = (p: AiProvider) => health.latencyMs.get(p.name) ?? Number.POSITIVE_INFINITY;
    // Array.prototype.sort is stable, so unmeasured providers keep the configured order.
    return [...deps.providers].sort((a, b) => cooling(a) - cooling(b) || speed(a) - speed(b));
  }

  async function generate(prompt: ModelPrompt, options?: { maxTokens?: number; jsonMode?: boolean }): Promise<AiResult> {
    if (deps.providers.length === 0) {
      return { ok: false, provider: null, errorClass: "no_provider", attempts: [] };
    }

    const startedAll = now();
    const ordered = rank(startedAll);
    const attempts: AiAttempt[] = [];
    const cancelLosers = new AbortController();
    const running = new Set<Promise<void>>();
    let next = 0;
    let stopped = false;
    let result: AiResult | null = null;

    const launch = (): boolean => {
      if (result || stopped || next >= ordered.length) return false;
      const remaining = deps.deadlineMs === undefined ? timeoutMs : deps.deadlineMs - (now() - startedAll);
      if (remaining <= 250) return false;
      const provider = ordered[next++];
      const started = now();
      const run = attempt(provider, prompt, options?.maxTokens, Math.min(timeoutMs, remaining), cancelLosers.signal, options?.jsonMode).then((outcome) => {
        if (result) return; // Lost the race; its failure is not the provider's fault.
        const ms = now() - started;
        if (outcome.ok) {
          health.cooldownUntil.delete(provider.name);
          const previous = health.latencyMs.get(provider.name);
          health.latencyMs.set(provider.name, previous === undefined ? ms : Math.round(previous * 0.7 + ms * 0.3));
          attempts.push({ provider: provider.name, ok: true, ms });
          result = { ok: true, provider: provider.name, text: outcome.text, attempts };
          cancelLosers.abort();
          return;
        }
        attempts.push({ provider: provider.name, ok: false, errorClass: outcome.errorClass, ms });
        const cooldown = cooldownFor(outcome);
        if (cooldown) health.cooldownUntil.set(provider.name, now() + cooldown);
        log.warn("ai provider failed", { provider: provider.name, errorClass: outcome.errorClass, ms });
        if (!outcome.retryable) stopped = true;
      });
      const tracked: Promise<void> = run.finally(() => running.delete(tracked));
      running.add(tracked);
      return true;
    };

    while (!result) {
      if (running.size === 0 && !launch()) break;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const racers: Promise<unknown>[] = [...running];
      if (deps.hedgeAfterMs !== undefined && next < ordered.length) {
        racers.push(new Promise((resolve) => (timer = setTimeout(() => resolve(HEDGE), deps.hedgeAfterMs))));
      }
      const first = await Promise.race(racers);
      clearTimeout(timer);
      if (first === HEDGE) launch();
    }

    return result ?? { ok: false, provider: null, errorClass: attempts[attempts.length - 1]?.errorClass ?? "deadline", attempts };
  }

  return { generate };
}

/**
 * Every HTTP failure falls through to the next provider: a 401 (bad key), 404
 * (retired model) or 429 (quota) is specific to this provider, and even a 400
 * may be a model limit another provider does not share.
 */
function httpOutcome(status: number): AiOutcome {
  return { ok: false, errorClass: `http_${status}`, retryable: true, status };
}

// ─── Real providers (never used in tests) ────────────────────────────────────

const FREE_SUFFIX = ":free";

/** OpenRouter, OpenAI-compatible. Refuses a paid model id unless the owner opted in. */
export function openRouterProvider(config: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  allowPaidModels: boolean;
  fetch?: typeof fetch;
  name?: string;
}): AiProvider {
  const model = config.model || DEFAULT_AI_MODELS.OPENROUTER_MODEL;
  const client = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || "https://openrouter.ai/api/v1",
    fetch: config.fetch,
  });

  return {
    name: config.name ?? "openrouter",
    async generate(prompt, options) {
      if (!config.allowPaidModels && !model.endsWith(FREE_SUFFIX)) {
        return { ok: false, errorClass: "paid_model_blocked", retryable: true };
      }
      return sdkGenerate(client(model), prompt, options);
    },
  };
}

/** The chain does the retrying: the SDK's own retries (2 by default, with backoff) would multiply every slow provider's latency. */
async function sdkGenerate(model: Parameters<typeof generateText>[0]["model"], prompt: ModelPrompt, options?: AiGenerateOptions): Promise<AiOutcome> {
  try {
    const result = await generateText({
      model,
      system: prompt.system,
      prompt: prompt.user,
      maxOutputTokens: options?.maxTokens ?? 1200,
      maxRetries: 0,
      abortSignal: options?.signal,
    });
    if (!result.text) return { ok: false, errorClass: "empty_response", retryable: true };
    return { ok: true, text: result.text };
  } catch (error) {
    const status = (error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status;
    if (status) return httpOutcome(status);
    return { ok: false, errorClass: options?.signal?.aborted ? "timeout" : "provider_error", retryable: true };
  }
}

/** NVIDIA NIM, OpenAI-compatible. */
export function nvidiaProvider(config: { apiKey: string; model?: string; fetch?: typeof fetch }): AiProvider {
  const model = config.model || DEFAULT_AI_MODELS.NVIDIA_MODEL;
  const client = createOpenAI({
    apiKey: config.apiKey,
    baseURL: "https://integrate.api.nvidia.com/v1",
    fetch: config.fetch,
  });

  return {
    name: "nvidia",
    generate: (prompt, options) => sdkGenerate(client(model), prompt, options),
  };
}

/** Gemini's own REST API (not OpenAI-compatible), called directly so no extra SDK is added for one provider. */
export function geminiProvider(config: { apiKey: string; model?: string; fetchImpl?: typeof fetch }): AiProvider {
  const model = config.model || DEFAULT_AI_MODELS.GEMINI_MODEL;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    name: "gemini",
    async generate(prompt, options) {
      try {
        const maxOutputTokens = options?.maxTokens ?? 2400;
        // Thinking tokens count against maxOutputTokens. On a short reply
        // (the chat widget asks for 500) any budget can use up the whole cap
        // and return no text, so short outputs get none; long structured
        // outputs (blog JSON) get a modest share.
        const thinkingBudget = maxOutputTokens >= 2000 ? Math.min(800, Math.floor(maxOutputTokens / 5)) : 0;
        const generationConfig: Record<string, unknown> = {
          maxOutputTokens,
          thinkingConfig: { thinkingBudget },
        };
        // When JSON mode is requested, ask the model to respond with valid JSON.
        // This dramatically improves structured output reliability for blog generation.
        if (options?.jsonMode) {
          generationConfig.responseMimeType = "application/json";
        }
        const response = await fetchImpl(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            // Header, not ?key=: query strings end up in proxy and access logs.
            headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey },
            signal: options?.signal,
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: prompt.system }] },
              contents: [{ role: "user", parts: [{ text: prompt.user }] }],
              generationConfig,
            }),
          }
        );
        if (!response.ok) return httpOutcome(response.status);
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
        if (!text) return { ok: false, errorClass: "empty_response", retryable: true };
        return { ok: true, text };
      } catch {
        return { ok: false, errorClass: options?.signal?.aborted ? "timeout" : "transport", retryable: true };
      }
    },
  };
}

/** Google Vertex AI's Gemini endpoint, authenticated with a service-account JWT
 * (lib/ai/vertex.ts) instead of an API key. Last resort in the chain: it is the
 * slowest to authenticate (a token exchange before every cold call) and the
 * most involved to configure correctly, so faster, simpler providers go first. */
export function vertexProvider(config: {
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
  project: string;
  location?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): AiProvider {
  const location = config.location ?? "us-central1";
  const model = config.model || DEFAULT_AI_MODELS.VERTEX_MODEL;
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    name: "vertex",
    async generate(prompt, options) {
      try {
        const accessToken = await getVertexAccessToken(
          { clientEmail: config.clientEmail, privateKey: config.privateKey, tokenUri: config.tokenUri },
          fetchImpl
        );
        const response = await fetchImpl(
          `https://${location}-aiplatform.googleapis.com/v1/projects/${config.project}/locations/${location}/publishers/google/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
            signal: options?.signal,
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: prompt.system }] },
              contents: [{ role: "user", parts: [{ text: prompt.user }] }],
              generationConfig: { maxOutputTokens: options?.maxTokens ?? 1800 },
            }),
          }
        );
        if (!response.ok) return httpOutcome(response.status);
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
        if (!text) return { ok: false, errorClass: "empty_response", retryable: true };
        return { ok: true, text };
      } catch {
        return { ok: false, errorClass: "transport", retryable: true };
      }
    },
  };
}

/**
 * The chain from decision D15, reordered for reliability:
 * 1. Gemini (free, fast, reliable with a valid API key)
 * 2. Vertex (service account, slowest but most reliable)
 * 3. OpenRouter (free-tier models are heavily rate-limited)
 * 4. NVIDIA (last — key may be dead or model retired)
 */
export function realProviders(env: AppEnv, fetchImpl?: typeof fetch): AiProvider[] {
  const providers: AiProvider[] = [];

  // 1. Gemini direct — fastest, most reliable, supports JSON mode
  if (env.GEMINI_API_KEY) {
    providers.push(geminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || DEFAULT_AI_MODELS.GEMINI_MODEL, fetchImpl }));
  }

  // 2. Vertex AI — service-account auth, slower cold start but reliable
  if (env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.GOOGLE_CLOUD_PROJECT && env.GOOGLE_TOKEN_URI) {
    providers.push(
      vertexProvider({
        clientEmail: env.GOOGLE_CLIENT_EMAIL,
        privateKey: env.GOOGLE_PRIVATE_KEY,
        tokenUri: env.GOOGLE_TOKEN_URI,
        project: env.GOOGLE_CLOUD_PROJECT,
        model: env.VERTEX_MODEL || DEFAULT_AI_MODELS.VERTEX_MODEL,
        fetchImpl,
      })
    );
  }

  // 3. OpenRouter — free-tier models are heavily rate-limited (429 common)
  const openRouterModel = env.OPENROUTER_MODEL || DEFAULT_AI_MODELS.OPENROUTER_MODEL;
  if (env.OPENROUTER_API_KEY) {
    providers.push(
      openRouterProvider({
        apiKey: env.OPENROUTER_API_KEY,
        model: openRouterModel,
        baseUrl: env.OPENROUTER_BASE_URL,
        allowPaidModels: env.OPENROUTER_ALLOW_PAID_MODELS,
        fetch: fetchImpl,
      })
    );
  }
  if (env.OPENROUTER_API_KEY_2) {
    providers.push(
      openRouterProvider({
        apiKey: env.OPENROUTER_API_KEY_2,
        model: openRouterModel,
        baseUrl: env.OPENROUTER_BASE_URL,
        allowPaidModels: env.OPENROUTER_ALLOW_PAID_MODELS,
        fetch: fetchImpl,
        name: "openrouter-2",
      })
    );
  }

  // 4. NVIDIA NIM — last; key may be invalid or model may be retired
  if (env.NVIDIA_API_KEY) {
    providers.push(
      nvidiaProvider({
        apiKey: env.NVIDIA_API_KEY,
        model: env.NVIDIA_MODEL || DEFAULT_AI_MODELS.NVIDIA_MODEL,
        fetch: fetchImpl,
      })
    );
  }

  return providers;
}
