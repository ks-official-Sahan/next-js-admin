import "server-only";

import { DEFAULT_AI_MODELS, type AppEnv } from "@/lib/env";

import { getVertexAccessToken } from "./vertex";

// AI image generation for the blog generator (featured image + inline
// content images), through the Vertex AI service account already wired for
// text generation (lib/ai/vertex.ts). Gemini image models are the default:
// verified 2026-09-25, this project gets HTTP 404 for every Imagen model
// (no access) and the Gemini API key is on the free tier, whose image quota
// is 0 requests a day. Vertex serves gemini-3.1-flash-image (global
// endpoint) and gemini-2.5-flash-image (regional) on the same account.
//
// Models are tried in order until one returns an image, so a model that is
// retired, rate limited or briefly down falls through to the next one.
// Never throws: every failure comes back as { ok: false }.

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

/** True when the Vertex service account needed for image generation is configured. */
export function imageGenerationAvailable(env: AppEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.GOOGLE_CLOUD_PROJECT && env.GOOGLE_TOKEN_URI);
}

export function vertexImageConfigFromEnv(env: AppEnv): VertexImageConfig | null {
  if (!imageGenerationAvailable(env)) return null;
  return {
    clientEmail: env.GOOGLE_CLIENT_EMAIL!,
    privateKey: env.GOOGLE_PRIVATE_KEY!,
    tokenUri: env.GOOGLE_TOKEN_URI!,
    project: env.GOOGLE_CLOUD_PROJECT!,
    model: env.IMAGEN_MODEL || DEFAULT_AI_MODELS.IMAGEN_MODEL,
  };
}
