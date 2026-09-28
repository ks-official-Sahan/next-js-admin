import "server-only";

import { getEnv, type AppEnv } from "@/lib/env";

import { imageConfigFromEnv } from "./image";
import { paidAllowed, vertexConfigured } from "./models";

// Which AI features can run, from the environment alone. A feature is on only
// when its switch is on and a provider for it is configured, so the UI never
// offers something every request would refuse.

/** At least one text provider can answer: a free key, or Vertex with AI_ALLOW_PAID. */
export function textAiConfigured(env: AppEnv = getEnv()): boolean {
  if (env.GEMINI_API_KEY || env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY_2 || env.NVIDIA_API_KEY) return true;
  return paidAllowed(env) && vertexConfigured(env);
}

/** The blog AI assistant: ENABLE_BLOG_AI=true (off by default) and a text provider. */
export function blogAiEnabled(env: AppEnv = getEnv()): boolean {
  return env.ENABLE_BLOG_AI && textAiConfigured(env);
}

/** Blog AI images (featured and inline): blog AI plus at least one image provider. */
export function blogAiImagesEnabled(env: AppEnv = getEnv()): boolean {
  return blogAiEnabled(env) && imageConfigFromEnv(env) !== null;
}
