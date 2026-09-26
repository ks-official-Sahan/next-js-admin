// Which model each AI provider uses, per purpose, and which providers may run
// at all. Pure: no env access, no network (callers pass the parsed env), so
// it is unit tested directly.
//
// Cost policy: free by default. Every default below was verified on
// 2026-09-26 to run on free tiers (Gemini API free key, OpenRouter ":free"
// models, NVIDIA's free developer API). Vertex AI bills pay-as-you-go, and
// Gemini's image models have no free quota (HTTP 429, limit 0), so those only
// join a chain when AI_ALLOW_PAID is set.
//
// Precedence for every model: the purpose-specific variable (BLOG_*, CHAT_*,
// IMAGE_*), then the older provider-wide variable (GEMINI_MODEL, ...), then
// the default here.

export type TextPurpose = "blog" | "chat";

export interface TextModels {
  gemini: string;
  openrouter: string;
  nvidia: string;
  vertex: string;
}

export interface ImageModels {
  nvidia: string;
  gemini: string;
  vertex: string;
}

/**
 * Verified 2026-09-26 on free keys: gemini-2.5-flash 1.8 s valid JSON,
 * gemini-3.1-flash-lite 1.6 s, nemotron-3-super-120b 5-7 s on both OpenRouter
 * (":free") and NVIDIA; the older defaults (deepseek-v4.1-flash on NVIDIA,
 * nemotron-3.5-lightning on OpenRouter) timed out or took 8 s+.
 */
export const DEFAULT_TEXT_MODELS: Record<TextPurpose, TextModels> = {
  // Long structured JSON: a full flash model, not lite.
  blog: {
    gemini: "gemini-2.5-flash",
    openrouter: "nvidia/nemotron-3-super-120b-a12b:free",
    nvidia: "nvidia/nemotron-3-super-120b-a12b",
    vertex: "gemini-2.5-flash",
  },
  // Short, latency-sensitive replies: the fastest free model first.
  chat: {
    gemini: "gemini-3.1-flash-lite",
    openrouter: "nvidia/nemotron-3-super-120b-a12b:free",
    nvidia: "nvidia/nemotron-3-super-120b-a12b",
    vertex: "gemini-2.5-flash",
  },
};

/** FLUX.1-dev on NVIDIA's free API: 1344x768 in about 6 s (verified 2026-09-26). The Gemini ones are paid-only. */
export const DEFAULT_IMAGE_MODELS: ImageModels = {
  nvidia: "black-forest-labs/flux.1-dev",
  gemini: "gemini-3.1-flash-image",
  vertex: "gemini-3.1-flash-image",
};

/** The subset of the parsed env this module reads. */
export interface ModelEnv {
  AI_ALLOW_PAID?: boolean;
  GEMINI_MODEL?: string;
  OPENROUTER_MODEL?: string;
  NVIDIA_MODEL?: string;
  VERTEX_MODEL?: string;
  IMAGEN_MODEL?: string;
  BLOG_GEMINI_MODEL?: string;
  BLOG_OPENROUTER_MODEL?: string;
  BLOG_NVIDIA_MODEL?: string;
  BLOG_VERTEX_MODEL?: string;
  CHAT_GEMINI_MODEL?: string;
  CHAT_OPENROUTER_MODEL?: string;
  CHAT_NVIDIA_MODEL?: string;
  CHAT_VERTEX_MODEL?: string;
  IMAGE_NVIDIA_MODEL?: string;
  IMAGE_GEMINI_MODEL?: string;
  IMAGE_VERTEX_MODEL?: string;
}

const pick = (...values: Array<string | undefined>): string => values.find((value) => value && value.trim())!.trim();

export function textModels(env: ModelEnv, purpose: TextPurpose): TextModels {
  const defaults = DEFAULT_TEXT_MODELS[purpose];
  const own = purpose === "blog"
    ? { gemini: env.BLOG_GEMINI_MODEL, openrouter: env.BLOG_OPENROUTER_MODEL, nvidia: env.BLOG_NVIDIA_MODEL, vertex: env.BLOG_VERTEX_MODEL }
    : { gemini: env.CHAT_GEMINI_MODEL, openrouter: env.CHAT_OPENROUTER_MODEL, nvidia: env.CHAT_NVIDIA_MODEL, vertex: env.CHAT_VERTEX_MODEL };
  return {
    gemini: pick(own.gemini, env.GEMINI_MODEL, defaults.gemini),
    openrouter: pick(own.openrouter, env.OPENROUTER_MODEL, defaults.openrouter),
    nvidia: pick(own.nvidia, env.NVIDIA_MODEL, defaults.nvidia),
    vertex: pick(own.vertex, env.VERTEX_MODEL, defaults.vertex),
  };
}

export function imageModels(env: ModelEnv): ImageModels {
  return {
    nvidia: pick(env.IMAGE_NVIDIA_MODEL, DEFAULT_IMAGE_MODELS.nvidia),
    gemini: pick(env.IMAGE_GEMINI_MODEL, DEFAULT_IMAGE_MODELS.gemini),
    vertex: pick(env.IMAGE_VERTEX_MODEL, env.IMAGEN_MODEL, DEFAULT_IMAGE_MODELS.vertex),
  };
}

/** Paid providers (Vertex, Gemini image) join a chain only when this is true. */
export const paidAllowed = (env: ModelEnv): boolean => env.AI_ALLOW_PAID === true;

/**
 * Gemini's thinking control differs by generation: 2.x takes a token budget
 * (0 = off), 3.x rejects `thinkingBudget` with HTTP 400 and takes a level.
 * Short replies get no thinking at all (it would eat a small output cap and
 * return empty text); long structured output gets a little.
 */
export function thinkingConfigFor(model: string, maxOutputTokens: number): Record<string, unknown> {
  const long = maxOutputTokens >= 2000;
  if (/^gemini-[3-9]/.test(model)) {
    return { thinkingLevel: long ? "low" : /flash/.test(model) ? "minimal" : "low" };
  }
  return { thinkingBudget: long ? Math.min(800, Math.floor(maxOutputTokens / 5)) : 0 };
}
