import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { previewRequestAllowed } from "./preview-gate";
import { deriveShareKey, signShareToken } from "./share-link";

const key = deriveShareKey("test-secret-test-secret-test-secret");
const now = 1_800_000_000_000;
const token = signShareToken("post_1", now + 60_000, key);

describe("previewRequestAllowed", () => {
  it("ignores other paths", () => {
    assert.equal(previewRequestAllowed("/updates/x", null, false, key, now), null);
    assert.equal(previewRequestAllowed("/previews", null, false, key, now), null);
  });

  it("lets a session through to any preview", () => {
    assert.equal(previewRequestAllowed("/preview/home", null, true, key, now), true);
    assert.equal(previewRequestAllowed("/preview/post/post_1", null, true, null, now), true);
  });

  it("needs a session for page previews", () => {
    assert.equal(previewRequestAllowed("/preview/home", token, false, key, now), false);
  });

  it("accepts a valid share token for its own post only", () => {
    assert.equal(previewRequestAllowed("/preview/post/post_1", token, false, key, now), true);
    assert.equal(previewRequestAllowed("/preview/post/post_2", token, false, key, now), false);
    assert.equal(previewRequestAllowed("/preview/post/post_1", null, false, key, now), false);
    assert.equal(previewRequestAllowed("/preview/post/post_1", token, false, key, now + 120_000), false);
    assert.equal(previewRequestAllowed("/preview/post/post_1", token, false, null, now), false);
  });
});
