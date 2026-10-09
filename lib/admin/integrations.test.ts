import { test, describe, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { resetEnvCache } from "@/lib/env";

import { describeAiCheck } from "./ai-check";
import { checkAiChains, checkAiProviders, checkBrevo, checkCloudinary, checkResend } from "./integrations";

// Fake fetch: no network call, no secret ever leaves the process. Each check
// is exercised for "not configured", "configured and reachable" and
// "configured and unreachable", proving the injectable fetch and the
// configured/reachable split without hitting a real provider.

/** Not a real key: a placeholder the checks must send but never return. */
const FAKE_AI_KEY = "fake-ai-key";

const ENV_KEYS = [
  "RESEND_API_KEY",
  "EMAIL_BREVO_API_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "OPENROUTER_API_KEY",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_TOKEN_URI",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "AI_CUSTOM_BASE_URL",
  "AI_CUSTOM_MODEL",
  "AI_CUSTOM_API_KEY",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const okFetch = async () => new Response(null, { status: 200 });
const failFetch = async () => new Response(null, { status: 500 });
const throwingFetch = async () => {
  throw new Error("network down");
};

describe("integration health checks", () => {
  test("resend: not configured returns reachable=null without calling fetch", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return okFetch();
    };
    const result = await checkResend(fetchImpl);
    assert.equal(result.configured, false);
    assert.equal(result.reachable, null);
    assert.equal(called, false);
  });

  test("resend: configured and reachable", async () => {
    process.env.RESEND_API_KEY = FAKE_AI_KEY;
    const result = await checkResend(okFetch);
    assert.equal(result.configured, true);
    assert.equal(result.reachable, true);
  });

  test("resend: configured but the ping fails", async () => {
    process.env.RESEND_API_KEY = FAKE_AI_KEY;
    const result = await checkResend(failFetch);
    assert.equal(result.configured, true);
    assert.equal(result.reachable, false);
  });

  test("resend: a thrown fetch (timeout, DNS failure) is treated as unreachable, not thrown", async () => {
    process.env.RESEND_API_KEY = FAKE_AI_KEY;
    await assert.doesNotReject(async () => {
      const result = await checkResend(throwingFetch);
      assert.equal(result.reachable, false);
    });
  });

  test("brevo: not configured", async () => {
    const result = await checkBrevo(okFetch);
    assert.equal(result.configured, false);
    assert.equal(result.reachable, null);
  });

  test("brevo: configured and reachable", async () => {
    process.env.EMAIL_BREVO_API_KEY = FAKE_AI_KEY;
    const result = await checkBrevo(okFetch);
    assert.equal(result.configured, true);
    assert.equal(result.reachable, true);
  });

  test("cloudinary: needs all three env vars to count as configured", async () => {
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "key";
    // secret intentionally left unset
    const result = await checkCloudinary(okFetch);
    assert.equal(result.configured, false);
    assert.equal(result.reachable, null);
  });

  test("cloudinary: fully configured and reachable", async () => {
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
    const result = await checkCloudinary(okFetch);
    assert.equal(result.configured, true);
    assert.equal(result.reachable, true);
  });
});

describe("AI providers: on demand only", () => {
  test("rows come from the adapter registry, never ping, and carry their check id", () => {
    let called = false;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      called = true;
      return okFetch();
    }) as typeof fetch;
    try {
      process.env.OPENAI_API_KEY = FAKE_AI_KEY;
      resetEnvCache();
      const rows = checkAiProviders();
      const openai = rows.find((row) => row.check === "openai")!;
      assert.equal(openai.configured, true);
      assert.equal(openai.reachable, null);
      assert.match(openai.hint, /AI_ALLOW_PAID=true/);
      assert.equal(rows.find((row) => row.check === "anthropic")!.configured, false);
      assert.ok(rows.every((row) => row.group === "AI" && !row.hint.includes(FAKE_AI_KEY)));
      assert.deepEqual(checkAiChains().map((row) => row.check), ["chain:blog", "chain:chat"]);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = original;
      resetEnvCache();
    }
  });

  test("describeAiCheck: answers, fall-throughs and failures read as one line", () => {
    assert.deepEqual(describeAiCheck({ id: "gemini", ok: true, provider: "gemini", ms: 812 }, "Gemini"), {
      reachable: true,
      message: "Gemini answered in 0.8 s.",
    });
    const chain = describeAiCheck(
      { id: "chain:blog", ok: true, provider: "nvidia", ms: 2400, attempts: [{ provider: "gemini", ok: false, errorClass: "http_429" }, { provider: "nvidia", ok: true }] },
      "The blog chain"
    );
    assert.equal(chain.message, "The blog chain answered via nvidia in 2.4 s after gemini failed.");
    assert.equal(describeAiCheck({ id: "openai", ok: false, errorClass: "http_401", ms: 90 }, "OpenAI").message, "OpenAI did not answer: the key was refused (HTTP 401).");
    assert.equal(describeAiCheck({ id: "gemini", ok: false, errorClass: "truncated", ms: 500 }, "Gemini").reachable, true);
    assert.equal(describeAiCheck({ id: "xai", ok: false, errorClass: "timeout", ms: 20000 }, "xAI").reachable, false);
  });
});
