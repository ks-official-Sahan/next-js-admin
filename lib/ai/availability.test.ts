import assert from "node:assert/strict";
import { test } from "node:test";

import { parseEnv } from "@/lib/env";

import { blogAiEnabled, blogAiImagesEnabled, textAiConfigured } from "./availability";

const vertex = {
  GOOGLE_CLIENT_EMAIL: "svc@example.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
  GOOGLE_CLOUD_PROJECT: "project",
};

test("blog AI is off by default, even with a provider key", () => {
  assert.equal(blogAiEnabled(parseEnv({ GEMINI_API_KEY: "key" })), false);
});

test("blog AI needs ENABLE_BLOG_AI and a text provider", () => {
  assert.equal(blogAiEnabled(parseEnv({ ENABLE_BLOG_AI: "true" })), false);
  assert.equal(blogAiEnabled(parseEnv({ ENABLE_BLOG_AI: "true", OPENROUTER_API_KEY_2: "key" })), true);
});

test("Vertex counts as a text provider only with AI_ALLOW_PAID", () => {
  assert.equal(textAiConfigured(parseEnv(vertex)), false);
  assert.equal(textAiConfigured(parseEnv({ ...vertex, AI_ALLOW_PAID: "true" })), true);
});

test("blog AI images need an image provider as well", () => {
  assert.equal(blogAiImagesEnabled(parseEnv({ ENABLE_BLOG_AI: "true", GEMINI_API_KEY: "key" })), false);
  assert.equal(blogAiImagesEnabled(parseEnv({ ENABLE_BLOG_AI: "true", GEMINI_API_KEY: "key", NVIDIA_API_KEY: "key" })), true);
});
