import assert from "node:assert/strict";
import { test } from "node:test";

import { rateLimitedResponse, retryMessage } from "./rate-limited";

test("retryMessage rounds up to seconds or minutes", () => {
  assert.equal(retryMessage(0), "Try again shortly.");
  assert.equal(retryMessage(Number.NaN), "Try again shortly.");
  assert.equal(retryMessage(12.2), "Try again in 13 seconds.");
  assert.equal(retryMessage(60), "Try again in 1 minute.");
  assert.equal(retryMessage(61), "Try again in 2 minutes.");
  assert.equal(retryMessage(3600), "Try again in 60 minutes.");
});

test("rateLimitedResponse is a JSON 429 with Retry-After", async () => {
  const response = rateLimitedResponse(90, "Post generation");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "90");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { ok: false, error: "Post generation limit reached. Try again in 2 minutes." });
});

test("rateLimitedResponse omits Retry-After when the limiter has no estimate", () => {
  assert.equal(rateLimitedResponse(0).headers.get("Retry-After"), null);
});
