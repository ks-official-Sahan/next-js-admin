import "server-only";

import { createAiService, realProviders, type AiProvider } from "./providers";
import { buildCoverPrompt, buildDraftPrompt, looksLikeLeak } from "./guard";
import { getEnv } from "@/lib/env";

// The two AI helpers behind app/api/admin/ai/{draft,cover}/route.ts
// (design notes, Step 12). Providers are injected so this module
// is unit tested without a real network call; the routes pass realProviders().

export interface DraftInput {
  topic: string;
  notes?: string;
}

export interface DraftResult {
  ok: true;
  html: string;
  provider: string;
}

export interface CoverInput {
  topic: string;
}

export interface CoverResult {
  ok: true;
  prompt: string;
  provider: string;
}

export type AiHelperFailure = { ok: false; error: string };

export interface AiDeps {
  providers: readonly AiProvider[];
}

/** The chain built from configured environment keys, for the routes to pass in. */
export function defaultAiDeps(): AiDeps {
  return { providers: realProviders(getEnv(), "blog") };
}

export async function draftPost(input: DraftInput, deps: AiDeps): Promise<DraftResult | AiHelperFailure> {
  const prompt = buildDraftPrompt(input);
  const service = createAiService({ providers: deps.providers });
  const result = await service.generate(prompt, { maxTokens: 1400 });

  if (!result.ok || !result.text) {
    return { ok: false, error: "No AI provider is configured or reachable right now." };
  }
  if (looksLikeLeak(result.text)) {
    return { ok: false, error: "The AI response looked unsafe and was discarded. Try a different topic." };
  }
  return { ok: true, html: result.text.trim(), provider: result.provider ?? "unknown" };
}

export async function suggestCover(input: CoverInput, deps: AiDeps): Promise<CoverResult | AiHelperFailure> {
  const prompt = buildCoverPrompt(input);
  const service = createAiService({ providers: deps.providers });
  const result = await service.generate(prompt, { maxTokens: 200 });

  if (!result.ok || !result.text) {
    return { ok: false, error: "No AI provider is configured or reachable right now." };
  }
  if (looksLikeLeak(result.text)) {
    return { ok: false, error: "The AI response looked unsafe and was discarded. Try a different topic." };
  }
  return { ok: true, prompt: result.text.trim(), provider: result.provider ?? "unknown" };
}
