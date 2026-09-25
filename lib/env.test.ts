import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_AI_MODELS, parseEnv } from "./env";

test("parseEnv defaults all AI models to DEFAULT_AI_MODELS when unset", () => {
  const parsed = parseEnv({});
  assert.equal(parsed.OPENROUTER_MODEL, DEFAULT_AI_MODELS.OPENROUTER_MODEL);
  assert.equal(parsed.GEMINI_MODEL, DEFAULT_AI_MODELS.GEMINI_MODEL);
  assert.equal(parsed.VERTEX_MODEL, DEFAULT_AI_MODELS.VERTEX_MODEL);
  assert.equal(parsed.NVIDIA_MODEL, DEFAULT_AI_MODELS.NVIDIA_MODEL);
  assert.equal(parsed.IMAGEN_MODEL, DEFAULT_AI_MODELS.IMAGEN_MODEL);
});

test("parseEnv falls back to DEFAULT_AI_MODELS when model variables are empty or whitespace", () => {
  const parsed = parseEnv({
    OPENROUTER_MODEL: "  ",
    GEMINI_MODEL: "",
    VERTEX_MODEL: " ",
    NVIDIA_MODEL: "    ",
    IMAGEN_MODEL: "",
  });
  assert.equal(parsed.OPENROUTER_MODEL, DEFAULT_AI_MODELS.OPENROUTER_MODEL);
  assert.equal(parsed.GEMINI_MODEL, DEFAULT_AI_MODELS.GEMINI_MODEL);
  assert.equal(parsed.VERTEX_MODEL, DEFAULT_AI_MODELS.VERTEX_MODEL);
  assert.equal(parsed.NVIDIA_MODEL, DEFAULT_AI_MODELS.NVIDIA_MODEL);
  assert.equal(parsed.IMAGEN_MODEL, DEFAULT_AI_MODELS.IMAGEN_MODEL);
});

test("parseEnv preserves custom model overrides for each provider", () => {
  const parsed = parseEnv({
    OPENROUTER_MODEL: "anthropic/claude-3.5-sonnet",
    GEMINI_MODEL: "gemini-1.5-pro",
    VERTEX_MODEL: "gemini-1.5-pro",
    NVIDIA_MODEL: "meta/llama-3.1-405b-instruct",
    IMAGEN_MODEL: "imagen-3.0-generate-002",
  });
  assert.equal(parsed.OPENROUTER_MODEL, "anthropic/claude-3.5-sonnet");
  assert.equal(parsed.GEMINI_MODEL, "gemini-1.5-pro");
  assert.equal(parsed.VERTEX_MODEL, "gemini-1.5-pro");
  assert.equal(parsed.NVIDIA_MODEL, "meta/llama-3.1-405b-instruct");
  assert.equal(parsed.IMAGEN_MODEL, "imagen-3.0-generate-002");
});
