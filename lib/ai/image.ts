import "server-only";

import type { AppEnv } from "@/lib/env";

import { imageModels, paidAllowed } from "./models";
import { getVertexAccessToken } from "./vertex";

// AI image generation for the blog generator (featured image + inline
// content images) and the featured-image card. Providers, in order:
//
// 1. NVIDIA (free developer API): FLUX.1-dev by default, 1344x768 in ~6 s
//    (verified 2026-09-26). The only free image source available: OpenRouter
//    has no free image-output model, and the Gemini API free tier has an image
//    quota of 0 (HTTP 429).
// 2. Gemini API image models, and 3. Vertex AI image models (below, which
//    fall back across Vertex models): both billed, so they join only when
//    AI_ALLOW_PAID is set (lib/ai/models.ts).
//
// Models per provider come from IMAGE_*_MODEL env vars or lib/ai/models.ts
// defaults. Providers are tried in order until one returns an image. Never
// throws: every failure comes back as { ok: false }.

export interface VertexImageConfig {
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
  project: string;
  /** Tried before the defaults. An `imagen-*` model uses the :predict API; anything else uses Gemini's generateContent. */
  model?: string;
  /** Region for `model`; defaults to "global" for Gemini 3.x models, else us-central1. */
  location?: string;
}

export type ImageOutcome = { ok: true; base64: string; mimeType: string } | { ok: false; error: string };

type AspectRatio = "1:1" | "16:9" | "4:3";

interface ImageModel {
  model: string;
  location: string;
}

export const DEFAULT_IMAGE_MODELS: readonly ImageModel[] = [
  { model: "gemini-3.1-flash-image", location: "global" },
  { model: "gemini-2.5-flash-image", location: "us-central1" },
];

function defaultLocation(model: string): string {
  return /^gemini-3/.test(model) ? "global" : "us-central1";
}

/** The configured model first (if any), then the defaults, without duplicates. */
export function imageModelChain(config: Pick<VertexImageConfig, "model" | "location">): ImageModel[] {
  const chain = config.model ? [{ model: config.model, location: config.location ?? defaultLocation(config.model) }] : [];
  for (const candidate of DEFAULT_IMAGE_MODELS) {
    if (!chain.some((entry) => entry.model === candidate.model)) chain.push(candidate);
  }
  return chain;
}

function endpoint(project: string, target: ImageModel, method: "predict" | "generateContent"): string {
  const host = target.location === "global" ? "aiplatform.googleapis.com" : `${target.location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${project}/locations/${target.location}/publishers/google/models/${target.model}:${method}`;
}

function requestFor(target: ImageModel, prompt: string, aspectRatio: AspectRatio): { method: "predict" | "generateContent"; body: unknown } {
  if (target.model.startsWith("imagen-")) {
    return {
      method: "predict",
      body: {
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio, safetySetting: "block_medium_and_above", personGeneration: "allow_adult" },
      },
    };
  }
  return {
    method: "generateContent",
    body: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
    },
  };
}

/** The first image in either response shape: Imagen `predictions[]` or Gemini `candidates[].content.parts[].inlineData`. */
export function extractImage(data: unknown): { base64: string; mimeType: string } | null {
  const prediction = (data as { predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }> })?.predictions?.[0];
  if (prediction?.bytesBase64Encoded) return { base64: prediction.bytesBase64Encoded, mimeType: prediction.mimeType || "image/png" };

  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> })?.candidates?.[0]
    ?.content?.parts;
  const inline = parts?.find((part) => part.inlineData?.data)?.inlineData;
  return inline?.data ? { base64: inline.data, mimeType: inline.mimeType || "image/png" } : null;
}

export async function generateImageVertex(
  prompt: string,
  config: VertexImageConfig,
  options: { aspectRatio?: AspectRatio; signal?: AbortSignal; fetchImpl?: typeof fetch } = {}
): Promise<ImageOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const aspectRatio = options.aspectRatio ?? "16:9";

  let accessToken: string;
  try {
    accessToken = await getVertexAccessToken(
      { clientEmail: config.clientEmail, privateKey: config.privateKey, tokenUri: config.tokenUri },
      fetchImpl
    );
  } catch (error) {
    return { ok: false, error: `Image generation failed: ${error instanceof Error ? error.message : "authentication error"}` };
  }

  const failures: string[] = [];
  for (const target of imageModelChain(config)) {
    if (options.signal?.aborted) return { ok: false, error: "Image generation timed out." };
    const { method, body } = requestFor(target, prompt, aspectRatio);
    try {
      const response = await fetchImpl(endpoint(config.project, target, method), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
        signal: options.signal,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        failures.push(`${target.model}: HTTP ${response.status}`);
        continue;
      }
      const image = extractImage(await response.json());
      if (image) return { ok: true, ...image };
      failures.push(`${target.model}: no image data`);
    } catch (error) {
      if (options.signal?.aborted) return { ok: false, error: "Image generation timed out." };
      failures.push(`${target.model}: ${error instanceof Error ? error.message : "transport error"}`);
    }
  }
  return { ok: false, error: `Image generation failed (${failures.join("; ")}).` };
}

/** True when the Vertex service account needed for Vertex image generation is configured. */
export function vertexImageAvailable(env: AppEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.GOOGLE_CLOUD_PROJECT && env.GOOGLE_TOKEN_URI);
}

// ─── NVIDIA (free) ──────────────────────────────────────────────────────────

/** FLUX on NVIDIA accepts only these edge lengths (768..1344 in steps of 64). */
const FLUX_SIZE: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1344, height: 768 },
  "4:3": { width: 1024, height: 768 },
  "1:1": { width: 1024, height: 1024 },
};

/** The request body for an NVIDIA genai image model: FLUX.1-dev settings, fewer steps for schnell. */
export function nvidiaImageRequest(model: string, prompt: string, aspectRatio: AspectRatio, seed: number): Record<string, unknown> {
  const size = FLUX_SIZE[aspectRatio];
  if (/schnell/.test(model)) return { prompt, ...size, steps: 4, seed };
  return { prompt, ...size, steps: 30, cfg_scale: 3.5, mode: "base", seed };
}

/** The image in an NVIDIA genai reply (`artifacts[0].base64`), with its type sniffed from the bytes. */
export function extractNvidiaImage(data: unknown): { base64: string; mimeType: string } | null {
  const artifact = (data as { artifacts?: Array<{ base64?: string; finishReason?: string }> })?.artifacts?.[0];
  if (!artifact?.base64 || (artifact.finishReason && artifact.finishReason !== "SUCCESS")) return null;
  const mimeType = artifact.base64.startsWith("/9j/") ? "image/jpeg" : artifact.base64.startsWith("UklG") ? "image/webp" : "image/png";
  return { base64: artifact.base64, mimeType };
}

type ProviderOptions = { signal?: AbortSignal; fetchImpl?: typeof fetch };

async function postForImage(
  model: string,
  url: string,
  init: { headers: Record<string, string>; body: unknown },
  extract: (data: unknown) => { base64: string; mimeType: string } | null,
  options: ProviderOptions
): Promise<ImageOutcome> {
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...init.headers },
      signal: options.signal,
      body: JSON.stringify(init.body),
    });
    if (!response.ok) return { ok: false, error: `${model}: HTTP ${response.status}` };
    const image = extract(await response.json());
    return image ? { ok: true, ...image } : { ok: false, error: `${model}: no image (filtered or empty)` };
  } catch (error) {
    if (options.signal?.aborted) return { ok: false, error: "Image generation timed out." };
    return { ok: false, error: `${model}: ${error instanceof Error ? error.message : "transport error"}` };
  }
}

function generateImageNvidia(prompt: string, config: { apiKey: string; model: string }, aspectRatio: AspectRatio, options: ProviderOptions) {
  return postForImage(
    config.model,
    `https://ai.api.nvidia.com/v1/genai/${config.model}`,
    {
      headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json" },
      body: nvidiaImageRequest(config.model, prompt, aspectRatio, Math.floor(Math.random() * 2 ** 31)),
    },
    extractNvidiaImage,
    options
  );
}

// ─── Gemini API (paid: no free image quota) ─────────────────────────────────

function generateImageGemini(prompt: string, config: { apiKey: string; model: string }, aspectRatio: AspectRatio, options: ProviderOptions) {
  return postForImage(
    config.model,
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
    {
      headers: { "x-goog-api-key": config.apiKey },
      body: { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } } },
    },
    extractImage,
    options
  );
}

// ─── The chain ──────────────────────────────────────────────────────────────

export interface ImageConfig {
  nvidia?: { apiKey: string; model: string };
  gemini?: { apiKey: string; model: string };
  vertex?: VertexImageConfig;
}

/** The configured image providers, free first; null when there is none. Paid ones only with AI_ALLOW_PAID. */
export function imageConfigFromEnv(env: AppEnv): ImageConfig | null {
  const models = imageModels(env);
  const paid = paidAllowed(env);
  const config: ImageConfig = {};
  if (env.NVIDIA_API_KEY) config.nvidia = { apiKey: env.NVIDIA_API_KEY, model: models.nvidia };
  if (paid && env.GEMINI_API_KEY) config.gemini = { apiKey: env.GEMINI_API_KEY, model: models.gemini };
  if (paid && vertexImageAvailable(env)) {
    config.vertex = {
      clientEmail: env.GOOGLE_CLIENT_EMAIL!,
      privateKey: env.GOOGLE_PRIVATE_KEY!,
      tokenUri: env.GOOGLE_TOKEN_URI!,
      project: env.GOOGLE_CLOUD_PROJECT!,
      model: models.vertex,
    };
  }
  return config.nvidia || config.gemini || config.vertex ? config : null;
}

/** Tries NVIDIA, then Gemini, then Vertex (whichever are configured) until one returns an image. */
export async function generateImage(
  prompt: string,
  config: ImageConfig,
  options: { aspectRatio?: AspectRatio } & ProviderOptions = {}
): Promise<ImageOutcome> {
  const aspectRatio = options.aspectRatio ?? "16:9";
  const attempts: Array<() => Promise<ImageOutcome>> = [];
  if (config.nvidia) attempts.push(() => generateImageNvidia(prompt, config.nvidia!, aspectRatio, options));
  if (config.gemini) attempts.push(() => generateImageGemini(prompt, config.gemini!, aspectRatio, options));
  if (config.vertex) attempts.push(() => generateImageVertex(prompt, config.vertex!, options));
  const failures: string[] = [];
  for (const run of attempts) {
    if (options.signal?.aborted) return { ok: false, error: "Image generation timed out." };
    const outcome = await run();
    if (outcome.ok) return outcome;
    failures.push(outcome.error);
  }
  return { ok: false, error: failures.length ? `Image generation failed (${failures.join("; ")}).` : "No image provider is configured." };
}
