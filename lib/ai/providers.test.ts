import assert from "node:assert/strict";
import { test } from "node:test";

import { createAiHealth, createAiService, geminiOutcome, geminiProvider, realProviders, type AiOutcome, type AiProvider } from "./providers";
import type { AppEnv } from "@/lib/env";
import { DEFAULT_TEXT_MODELS } from "./models";
import type { ModelPrompt } from "./guard";

const PROMPT: ModelPrompt = { system: "sys", user: "user" };

function fakeProvider(name: string, outcome: AiOutcome): AiProvider {
  return { name, generate: async () => outcome };
}

test("uses the first provider that succeeds", async () => {
  const service = createAiService({
    providers: [
      fakeProvider("a", { ok: false, errorClass: "http_500", retryable: true }),
      fakeProvider("b", { ok: true, text: "drafted body" }),
      fakeProvider("c", { ok: true, text: "should not be reached" }),
    ],
  });
  const result = await service.generate(PROMPT);
  assert.equal(result.ok, true);
  assert.equal(result.provider, "b");
  assert.equal(result.text, "drafted body");
  assert.deepEqual(
    result.attempts.map((a) => a.provider),
    ["a", "b"]
  );
});

test("a reply that accept turns down falls through to the next provider", async () => {
  const service = createAiService({
    providers: [fakeProvider("a", { ok: true, text: "{ broken" }), fakeProvider("b", { ok: true, text: "{}" })],
  });
  const result = await service.generate(PROMPT, { accept: (text) => (text === "{}" ? null : "Invalid JSON") });
  assert.equal(result.provider, "b");
  assert.deepEqual(
    result.attempts.map((a) => [a.provider, a.errorClass]),
    [["a", "invalid_output"], ["b", undefined]]
  );
});

test("when every reply is turned down, the last one is returned for repair", async () => {
  const service = createAiService({ providers: [fakeProvider("a", { ok: true, text: "{ broken" })] });
  const result = await service.generate(PROMPT, { accept: () => "Invalid JSON" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.rejected, { provider: "a", text: "{ broken", reason: "Invalid JSON" });
});

test("with hedging, a fast invalid reply does not beat a slower valid one", async () => {
  const slow: AiProvider = { name: "slow", generate: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, text: "valid" }), 30)) };
  const service = createAiService({ providers: [slow, fakeProvider("fast", { ok: true, text: "junk" })], hedgeAfterMs: 5 });
  const result = await service.generate(PROMPT, { accept: (text) => (text === "valid" ? null : "bad") });
  assert.equal(result.provider, "slow");
  assert.equal(result.text, "valid");
});

test("geminiOutcome treats a MAX_TOKENS stop as truncated and skips thought parts", () => {
  assert.deepEqual(geminiOutcome({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{\"a\":" }] } }] }), {
    ok: false,
    errorClass: "truncated",
    retryable: true,
  });
  assert.deepEqual(geminiOutcome({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "plan", thought: true }, { text: "{}" }] } }] }), {
    ok: true,
    text: "{}",
  });
  assert.equal(geminiOutcome({}).ok, false);
});

test("a lastResort provider goes after every other one, even when it was fastest", async () => {
  const health = createAiHealth();
  health.latencyMs.set("paid", 1);
  health.latencyMs.set("free", 9_000);
  health.cooldownUntil.set("free", Date.now() + 60_000);
  const order: string[] = [];
  const provider = (name: string, lastResort = false): AiProvider => ({
    name,
    lastResort,
    generate: async () => {
      order.push(name);
      return { ok: false, errorClass: "http_500", retryable: true };
    },
  });
  await createAiService({ providers: [provider("paid", true), provider("free")], health }).generate(PROMPT);
  assert.deepEqual(order, ["free", "paid"]);
});

test("stops at a non-retryable failure without trying later providers", async () => {
  const service = createAiService({
    providers: [
      fakeProvider("a", { ok: false, errorClass: "paid_model_blocked", retryable: false }),
      fakeProvider("b", { ok: true, text: "never reached" }),
    ],
  });
  const result = await service.generate(PROMPT);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.attempts.map((a) => a.provider),
    ["a"]
  );
});

test("an empty provider list fails without attempts", async () => {
  const service = createAiService({ providers: [] });
  const result = await service.generate(PROMPT);
  assert.equal(result.ok, false);
  assert.equal(result.errorClass, "no_provider");
  assert.deepEqual(result.attempts, []);
});

test("a provider that throws is treated as a retryable transport failure", async () => {
  const service = createAiService({
    providers: [
      { name: "throws", generate: async () => { throw new Error("boom"); } },
      fakeProvider("b", { ok: true, text: "ok" }),
    ],
  });
  const result = await service.generate(PROMPT);
  assert.equal(result.ok, true);
  assert.equal(result.provider, "b");
});

function slowProvider(name: string, ms: number, text = name): AiProvider & { aborted: () => boolean } {
  let aborted = false;
  return {
    name,
    aborted: () => aborted,
    generate: (_prompt, options) =>
      new Promise<AiOutcome>((resolve) => {
        const timer = setTimeout(() => resolve({ ok: true, text }), ms);
        options?.signal?.addEventListener("abort", () => {
          aborted = true;
          clearTimeout(timer);
          resolve({ ok: false, errorClass: "aborted", retryable: true });
        });
      }),
  };
}

test("hedging starts the next provider when the first is slow, and aborts the loser", async () => {
  // "slow" only finishes if the test is broken (it is aborted long before),
  // so a stalled event loop under a loaded test run cannot let it win.
  const slow = slowProvider("slow", 10_000);
  const fast = slowProvider("fast", 10);
  const service = createAiService({ providers: [slow, fast], hedgeAfterMs: 30 });
  const result = await service.generate(PROMPT);
  assert.equal(result.provider, "fast");
  assert.equal(slow.aborted(), true);
});

test("without hedging, attempts run one at a time in order", async () => {
  const service = createAiService({ providers: [slowProvider("first", 40), slowProvider("second", 1)] });
  const result = await service.generate(PROMPT);
  assert.equal(result.provider, "first");
});

test("a provider that recently failed with 429 is tried after healthy ones", async () => {
  const health = createAiHealth();
  const limited = fakeProvider("limited", { ok: false, errorClass: "http_429", retryable: true, status: 429 });
  const ok = fakeProvider("ok", { ok: true, text: "hi" });
  await createAiService({ providers: [limited, ok], health }).generate(PROMPT);
  const calls: string[] = [];
  const spy = (p: AiProvider): AiProvider => ({ name: p.name, generate: (...args) => (calls.push(p.name), p.generate(...args)) });
  await createAiService({ providers: [spy(limited), spy(ok)], health }).generate(PROMPT);
  assert.deepEqual(calls, ["ok"]);
});

test("the deadline stops the chain before a later provider starts", async () => {
  let now = 0;
  const service = createAiService({
    providers: [fakeProvider("a", { ok: false, errorClass: "http_500", retryable: true, status: 500 }), fakeProvider("b", { ok: true, text: "late" })],
    deadlineMs: 1000,
    now: () => (now += 600),
  });
  const result = await service.generate(PROMPT);
  assert.equal(result.ok, false);
  assert.deepEqual(result.attempts.map((a) => a.provider), ["a"]);
});

test("geminiProvider uses custom model when provided, the blog default otherwise", async () => {
  let requestedUrl = "";
  const dummyFetch = (async (url: string | URL | Request) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "response" }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;

  const defaultGemini = geminiProvider({ apiKey: "test-key", fetchImpl: dummyFetch });
  await defaultGemini.generate(PROMPT);
  assert.ok(requestedUrl.includes(DEFAULT_TEXT_MODELS.blog.gemini));

  const customGemini = geminiProvider({ apiKey: "test-key", model: "custom-gemini-pro", fetchImpl: dummyFetch });
  await customGemini.generate(PROMPT);
  assert.ok(requestedUrl.includes("custom-gemini-pro"));
});

test("realProviders instantiates configured providers and defaults missing models", () => {
  const dummyEnv = {
    GEMINI_API_KEY: "dummy-gemini-key",
    NVIDIA_API_KEY: "dummy-nvidia-key",
    OPENROUTER_API_KEY: "dummy-openrouter-key",
  } as unknown as AppEnv;

  const providers = realProviders(dummyEnv, "blog");
  assert.equal(providers.length, 3);
  assert.deepEqual(providers.map((p) => p.name), ["gemini", "openrouter", "nvidia"]);
});

test("realProviders leaves paid Vertex out unless AI_ALLOW_PAID is set", () => {
  const env = {
    GEMINI_API_KEY: "g",
    GOOGLE_CLIENT_EMAIL: "a@b.iam.gserviceaccount.com",
    GOOGLE_PRIVATE_KEY: "key",
    GOOGLE_CLOUD_PROJECT: "proj",
    GOOGLE_TOKEN_URI: "https://oauth2.googleapis.com/token",
  } as unknown as AppEnv;
  assert.deepEqual(realProviders(env, "chat").map((p) => p.name), ["gemini"]);
  assert.deepEqual(realProviders({ ...env, AI_ALLOW_PAID: true } as AppEnv, "chat").map((p) => p.name), ["gemini", "vertex"]);
});

test("realProviders picks each purpose's model: purpose env, then provider env, then default", async () => {
  const urls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const run = async (env: Record<string, unknown>, purpose: "blog" | "chat") => {
    await realProviders({ GEMINI_API_KEY: "g", ...env } as unknown as AppEnv, purpose, fetchImpl)[0].generate(PROMPT);
    return urls.at(-1) ?? "";
  };
  assert.ok((await run({}, "chat")).includes("/" + DEFAULT_TEXT_MODELS.chat.gemini + ":"));
  assert.ok((await run({}, "blog")).includes("/" + DEFAULT_TEXT_MODELS.blog.gemini + ":"));
  assert.ok((await run({ GEMINI_MODEL: "gemini-x" }, "chat")).includes("/gemini-x:"));
  assert.ok((await run({ GEMINI_MODEL: "gemini-x", CHAT_GEMINI_MODEL: "gemini-chat" }, "chat")).includes("/gemini-chat:"));
});

test("geminiProvider sends a response schema when jsonMode carries one", async () => {
  let body: { generationConfig?: Record<string, unknown> } = {};
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const schema = { type: "OBJECT", properties: { a: { type: "STRING" } } };
  await geminiProvider({ apiKey: "k", fetchImpl }).generate(PROMPT, { jsonMode: { schema } });
  assert.equal(body.generationConfig?.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig?.responseSchema, schema);
  await geminiProvider({ apiKey: "k", fetchImpl }).generate(PROMPT, { jsonMode: true });
  assert.equal(body.generationConfig?.responseSchema, undefined);
});
