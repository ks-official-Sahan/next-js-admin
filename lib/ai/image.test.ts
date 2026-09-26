import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

import {
  DEFAULT_IMAGE_MODELS,
  extractNvidiaImage,
  generateImage,
  generateImageVertex,
  imageConfigFromEnv,
  imageModelChain,
  nvidiaImageRequest,
  vertexImageAvailable,
} from "./image";
import { DEFAULT_IMAGE_MODELS as MODEL_DEFAULTS } from "./models";
import { resetVertexTokenCache } from "./vertex";
import type { AppEnv } from "@/lib/env";

// A syntactically valid RSA private key is required for crypto.createSign to
// succeed (same fixture as lib/ai/vertex.test.ts).
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC9UK0+ebvUyGG0
QeHhtopls3bry+gjoQNz0MCl3rIZ5L/YIkCeL7D3jA/72qW4d3Z8VSVxEwcsJHIR
T6r1FM/KpkhO6bKhZ5dHU27/vD0WtyLFMtvAKNPBQDdnlYgRzFt8zJwEheC3R9DG
yppp5M5SskReajnnQzmVweVhCBe45mJsXC/TLqCvDA4MOGjo3bhgctknUpCZPEuY
aAs8ogG6myLBAHbu4WJVLhF1bHLqqefsYDuxM3qAFt7IiE4s1JPNnKFGl2+SKVGL
jR79SI7a5I0w1xdpyBW40BXFCvAm//pZUVGHgQrArTT3Y6E6oPlsj5E0cFFOjrWj
CXIBKMLBAgMBAAECggEADuxDG7+gzL8W5Iyk75PiCO5Cm4exPs28Ze64oNqTE3Ny
o+jfSxjbTEggImwzz/yqvFZB403qrNIao76x7Su8zW6aGI5XZF20EQ1EnKgL8LRy
6zR9GgKd3offViz1UuHW/FlsmvaqpgflLyZdUaeVk/M1bHPXKKGl8mYcXK+0nwB3
XfzguitHXS1resNVCd1eshjaAmbAhVpry7KTy12R2nEr7tDAxcbDsuAHkmA6AFWy
2K/kvom0t+1xHcM1pDMXppj4mGzEfQ/vW2E/xf659RNJNA2rTsP3JySqmXTCNAFU
YhFK2TyJzKiT624w1cBVtiX17w34e8wdvGEpQ0swoQKBgQDhpURDEu7vroW4pQRx
0foFXhePAiBUHAUiviZOrrBzddsGASIm8Q5pT7eRRSP8/NTxDrn/mQiO4QKMHNW2
vh+46otGzjSECwWu3H1b3i7y3Yeg5DV28r+eBYjSNIxY4Q3yoJbIW3Xsw/Taa1lA
G5xnfQb3jtCtDXtWZBR/HtQgRQKBgQDWyEVIE/7++ooRNOoKDyN/f6dNJ9WfS8/t
+cFQ00CvEr+ZIfPwUxTOuCu//rz+rCMabVJRLvDHqa0ZIKF5oTdKZo4sHe5SaXwF
O5GjPuOyMzeLgIWC6KYOSroLqRsAsB1rwMXJ9qdckKwJFBzM9Ip+YxyREr96imMU
S2ZyamK2TQKBgHvF+OzF/PTSiZ1gP1Dj+j5pf4i9hNg+Sn7lSQQOBNJAyrS/eGld
/ya7SJlSEMycL35PMq3G1w/w00HiK0TDg4kedumPAPWRSjvBzK3Q8XXdGKGjrMQj
ogJfTM7pbjbutITrm+opaUVHtA7/pYRp4OBPj7vJxiO26nnYCfo1Aez1AoGBAMSt
veukC/SXnkjlaI9vj3UYgy4/FPp7JNvpwiFuYaQwCe2DTus6WSp3MfDtp0mafcac
Zy3aSzi64rzIybUkcQobYYN6oRssZxovk0ymsUEkb2+6cAgRXMZnnXhCEW0O2NIs
Q7KOwHEeNbtWhI0WPaBAyA782QSwpswVw6lwTBZdAoGAah2tb2Gw24v8M3feqec2
wozPWpIFXIp9aFaKHlA45ab0PtXcHwJCjEdfMFVxffOTBw4LPYWcCS08GIJp3tlA
W28+ruXgDN53UkhlQXIZuaKV0BODtO2tQY83Akf6wd1BTm5ccIbb5Ie9LM2yeh0Y
uOOnJnF06fJOlbJv6rbjgSc=
-----END PRIVATE KEY-----`;

const CONFIG = {
  clientEmail: "test@example.iam.gserviceaccount.com",
  privateKey: PRIVATE_KEY,
  tokenUri: "https://oauth2.googleapis.com/token",
  project: "test-project",
};

function fetchSequence(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  return async () => {
    const entry = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return new Response(JSON.stringify(entry.body), { status: entry.status });
  };
}

beforeEach(() => resetVertexTokenCache());

test("generateImageVertex returns base64 image data on success", async () => {
  const fetchImpl = fetchSequence([
    { status: 200, body: { access_token: "tok-1", expires_in: 3600 } },
    { status: 200, body: { predictions: [{ bytesBase64Encoded: "AAAA", mimeType: "image/png" }] } },
  ]);
  const result = await generateImageVertex("a skyline at dusk", CONFIG, { fetchImpl: fetchImpl as unknown as typeof fetch });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.base64, "AAAA");
    assert.equal(result.mimeType, "image/png");
  }
});

test("generateImageVertex fails gracefully (never throws) on an HTTP error from the predict call", async () => {
  const fetchImpl = fetchSequence([
    { status: 200, body: { access_token: "tok-1", expires_in: 3600 } },
    { status: 500, body: { error: "boom" } },
  ]);
  const result = await generateImageVertex("a skyline", CONFIG, { fetchImpl: fetchImpl as unknown as typeof fetch });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /HTTP 500/);
});

test("generateImageVertex fails gracefully when the response has no prediction", async () => {
  const fetchImpl = fetchSequence([
    { status: 200, body: { access_token: "tok-1", expires_in: 3600 } },
    { status: 200, body: { predictions: [] } },
  ]);
  const result = await generateImageVertex("a skyline", CONFIG, { fetchImpl: fetchImpl as unknown as typeof fetch });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /no image data/);
});

test("generateImageVertex fails gracefully when the token exchange throws", async () => {
  const fetchImpl = async () => {
    throw new Error("network down");
  };
  const result = await generateImageVertex("a skyline", CONFIG, { fetchImpl: fetchImpl as unknown as typeof fetch });
  assert.equal(result.ok, false);
});

test("generateImageVertex reads a Gemini inlineData image and calls generateContent on the global endpoint", async () => {
  const urls: string[] = [];
  const responses = [
    { status: 200, body: { access_token: "tok-1", expires_in: 3600 } },
    { status: 200, body: { candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { data: "BBBB", mimeType: "image/png" } }] } }] } },
  ];
  const fetchImpl = async (url: string) => {
    urls.push(url);
    const entry = responses[Math.min(urls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(entry.body), { status: entry.status });
  };
  const result = await generateImageVertex("a skyline", CONFIG, { fetchImpl: fetchImpl as unknown as typeof fetch });
  assert.deepEqual(result, { ok: true, base64: "BBBB", mimeType: "image/png" });
  assert.match(urls[1], /^https:\/\/aiplatform\.googleapis\.com\/.*\/locations\/global\/.*gemini-3\.1-flash-image:generateContent$/);
});

test("generateImageVertex falls through to the next model after a 404", async () => {
  const fetchImpl = fetchSequence([
    { status: 200, body: { access_token: "tok-1", expires_in: 3600 } },
    { status: 404, body: { error: { code: 404 } } },
    { status: 200, body: { candidates: [{ content: { parts: [{ inlineData: { data: "CCCC", mimeType: "image/png" } }] } }] } },
  ]);
  const result = await generateImageVertex("a skyline", CONFIG, { fetchImpl: fetchImpl as unknown as typeof fetch });
  assert.equal(result.ok, true);
});

test("imageModelChain puts a configured model first and never repeats one", () => {
  assert.deepEqual(
    imageModelChain({}).map((entry) => entry.model),
    DEFAULT_IMAGE_MODELS.map((entry) => entry.model)
  );
  const chain = imageModelChain({ model: "imagen-4.0-generate-001" });
  assert.deepEqual(chain[0], { model: "imagen-4.0-generate-001", location: "us-central1" });
  assert.equal(chain.length, DEFAULT_IMAGE_MODELS.length + 1);
  assert.equal(imageModelChain({ model: "gemini-2.5-flash-image" }).length, DEFAULT_IMAGE_MODELS.length);
});

// ─── env wiring ────────────────────────────────────────────────────────────

const BASE_ENV = {} as AppEnv;
const VERTEX = {
    GOOGLE_CLIENT_EMAIL: "a@b.iam.gserviceaccount.com",
    GOOGLE_PRIVATE_KEY: "key",
    GOOGLE_CLOUD_PROJECT: "proj",
    GOOGLE_TOKEN_URI: "https://oauth2.googleapis.com/token",
} as Partial<AppEnv>;

test("vertexImageAvailable needs all four service-account variables", () => {
  assert.equal(vertexImageAvailable(BASE_ENV), false);
  assert.equal(vertexImageAvailable({ ...BASE_ENV, ...VERTEX } as AppEnv), true);
});

test("imageConfigFromEnv is free-only by default: NVIDIA in, Gemini and Vertex out", () => {
  assert.equal(imageConfigFromEnv(BASE_ENV), null);
  const env = { ...VERTEX, NVIDIA_API_KEY: "nv", GEMINI_API_KEY: "gm" } as AppEnv;
  assert.deepEqual(imageConfigFromEnv(env), { nvidia: { apiKey: "nv", model: MODEL_DEFAULTS.nvidia } });
  // Paid-only providers alone configure nothing without AI_ALLOW_PAID.
  assert.equal(imageConfigFromEnv({ ...VERTEX, GEMINI_API_KEY: "gm" } as AppEnv), null);
});

test("imageConfigFromEnv adds Gemini and Vertex with AI_ALLOW_PAID, honouring IMAGE_* and the older IMAGEN_MODEL", () => {
  const env = {
    ...VERTEX,
    NVIDIA_API_KEY: "nv",
    GEMINI_API_KEY: "gm",
    AI_ALLOW_PAID: true,
    IMAGE_NVIDIA_MODEL: "black-forest-labs/flux.1-schnell",
    IMAGEN_MODEL: "imagen-4.0-generate-001",
  } as AppEnv;
  const config = imageConfigFromEnv(env);
  assert.equal(config?.nvidia?.model, "black-forest-labs/flux.1-schnell");
  assert.equal(config?.gemini?.model, MODEL_DEFAULTS.gemini);
  assert.equal(config?.vertex?.model, "imagen-4.0-generate-001");
  assert.equal(imageConfigFromEnv({ ...env, IMAGE_VERTEX_MODEL: "gemini-2.5-flash-image" } as AppEnv)?.vertex?.model, "gemini-2.5-flash-image");
});

// ─── NVIDIA ────────────────────────────────────────────────────────────────

test("nvidiaImageRequest uses sizes FLUX accepts, and fewer steps for schnell", () => {
  assert.deepEqual(nvidiaImageRequest("black-forest-labs/flux.1-dev", "p", "16:9", 7), { prompt: "p", width: 1344, height: 768, steps: 30, cfg_scale: 3.5, mode: "base", seed: 7 });
  assert.deepEqual(nvidiaImageRequest("black-forest-labs/flux.1-schnell", "p", "4:3", 7), { prompt: "p", width: 1024, height: 768, steps: 4, seed: 7 });
});

test("extractNvidiaImage sniffs the type and rejects filtered artifacts", () => {
  assert.deepEqual(extractNvidiaImage({ artifacts: [{ base64: "/9j/abc", finishReason: "SUCCESS" }] }), { base64: "/9j/abc", mimeType: "image/jpeg" });
  assert.equal(extractNvidiaImage({ artifacts: [{ base64: "iVBOR", finishReason: "CONTENT_FILTERED" }] }), null);
  assert.equal(extractNvidiaImage({}), null);
});

test("generateImage returns NVIDIA's image and never calls a paid provider after it", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ artifacts: [{ base64: "iVBORw0K", finishReason: "SUCCESS" }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const result = await generateImage("a desk", { nvidia: { apiKey: "nv", model: "black-forest-labs/flux.1-dev" }, gemini: { apiKey: "gm", model: "g" } }, { fetchImpl });
  assert.deepEqual(result, { ok: true, base64: "iVBORw0K", mimeType: "image/png" });
  assert.deepEqual(calls, ["https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev"]);
});

test("generateImage falls through to the next provider and reports every failure", async () => {
  const fetchImpl = (async (url: string | URL | Request) =>
    String(url).includes("nvidia")
      ? new Response("{}", { status: 503 })
      : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: "img", mimeType: "image/png" } }] } }] }), { status: 200 })) as unknown as typeof fetch;
  const ok = await generateImage("x", { nvidia: { apiKey: "nv", model: "m" }, gemini: { apiKey: "gm", model: "g" } }, { fetchImpl });
  assert.equal(ok.ok, true);
  const failing = (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
  const failed = await generateImage("x", { nvidia: { apiKey: "nv", model: "m" }, gemini: { apiKey: "gm", model: "g" } }, { fetchImpl: failing });
  assert.deepEqual(failed, { ok: false, error: "Image generation failed (m: HTTP 429; g: HTTP 429)." });
});
