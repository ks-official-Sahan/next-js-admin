import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_IMAGE_MODELS, DEFAULT_TEXT_MODELS, imageModels, paidAllowed, textModels, thinkingConfigFor } from "./ai/models";
import { parseEnv } from "./env";

test("unset or blank model variables resolve to the verified free defaults", () => {
  for (const env of [parseEnv({}), parseEnv({ GEMINI_MODEL: "  ", OPENROUTER_MODEL: "", NVIDIA_MODEL: " ", VERTEX_MODEL: "", IMAGEN_MODEL: " " })]) {
    assert.deepEqual(textModels(env, "blog"), DEFAULT_TEXT_MODELS.blog);
    assert.deepEqual(textModels(env, "chat"), DEFAULT_TEXT_MODELS.chat);
    assert.deepEqual(imageModels(env), DEFAULT_IMAGE_MODELS);
  }
});

test("a provider-wide model variable applies to both blog and chat", () => {
  const env = parseEnv({
    OPENROUTER_MODEL: "anthropic/claude-3.5-sonnet",
    GEMINI_MODEL: "gemini-1.5-pro",
    VERTEX_MODEL: "gemini-1.5-pro",
    NVIDIA_MODEL: "meta/llama-3.1-405b-instruct",
    IMAGEN_MODEL: "imagen-3.0-generate-002",
  });
  for (const purpose of ["blog", "chat"] as const) {
    assert.deepEqual(textModels(env, purpose), {
      gemini: "gemini-1.5-pro",
      openrouter: "anthropic/claude-3.5-sonnet",
      nvidia: "meta/llama-3.1-405b-instruct",
      vertex: "gemini-1.5-pro",
    });
  }
  assert.equal(imageModels(env).vertex, "imagen-3.0-generate-002");
});

test("purpose-specific variables win over provider-wide ones, per purpose", () => {
  const env = parseEnv({
    GEMINI_MODEL: "gemini-wide",
    BLOG_GEMINI_MODEL: "gemini-blog",
    CHAT_OPENROUTER_MODEL: "chat/model:free",
    IMAGE_NVIDIA_MODEL: "black-forest-labs/flux.1-schnell",
    IMAGE_VERTEX_MODEL: "gemini-2.5-flash-image",
    IMAGEN_MODEL: "imagen-3.0-generate-002",
  });
  assert.equal(textModels(env, "blog").gemini, "gemini-blog");
  assert.equal(textModels(env, "chat").gemini, "gemini-wide");
  assert.equal(textModels(env, "chat").openrouter, "chat/model:free");
  assert.equal(textModels(env, "blog").openrouter, DEFAULT_TEXT_MODELS.blog.openrouter);
  assert.equal(imageModels(env).nvidia, "black-forest-labs/flux.1-schnell");
  assert.equal(imageModels(env).vertex, "gemini-2.5-flash-image");
});

test("paid providers stay off unless AI_ALLOW_PAID is set", () => {
  assert.equal(paidAllowed(parseEnv({})), false);
  assert.equal(paidAllowed(parseEnv({ AI_ALLOW_PAID: "true" })), true);
});

test("thinkingConfigFor uses a budget on Gemini 2.x and a level on 3.x", () => {
  assert.deepEqual(thinkingConfigFor("gemini-2.5-flash", 500), { thinkingBudget: 0 });
  assert.deepEqual(thinkingConfigFor("gemini-2.5-flash", 8192), { thinkingBudget: 800 });
  assert.deepEqual(thinkingConfigFor("gemini-3.1-flash-lite", 500), { thinkingLevel: "minimal" });
  assert.deepEqual(thinkingConfigFor("gemini-3.1-flash-lite", 8192), { thinkingLevel: "low" });
  assert.deepEqual(thinkingConfigFor("gemini-3-pro", 500), { thinkingLevel: "low" });
});
