import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { signMediaUrl, verifyMediaSignature, signCloudinaryUpload } from "./signature";

const TEST_MEDIA_SECRET = "test-secret-12345678901234567890";
const TEST_CLOUDINARY_SECRET = "test-cloudinary-secret-1234567890";

describe("Media signatures", () => {
  it("signs a media URL with mediaId only", () => {
    const sig = signMediaUrl({ mediaId: "test123" }, TEST_MEDIA_SECRET);
    assert(typeof sig === "string");
    assert(sig.length === 64); // SHA256 hex is 64 chars
  });

  it("signs a media URL with width and quality", () => {
    const sig = signMediaUrl({ mediaId: "test123", width: 800, quality: 85 }, TEST_MEDIA_SECRET);
    assert(typeof sig === "string");
    assert(sig.length === 64);
  });

  it("produces different signatures for different inputs", () => {
    const sig1 = signMediaUrl({ mediaId: "test1" }, TEST_MEDIA_SECRET);
    const sig2 = signMediaUrl({ mediaId: "test2" }, TEST_MEDIA_SECRET);
    assert(sig1 !== sig2);
  });

  it("produces different signatures for different widths", () => {
    const sig1 = signMediaUrl({ mediaId: "test", width: 600 }, TEST_MEDIA_SECRET);
    const sig2 = signMediaUrl({ mediaId: "test", width: 800 }, TEST_MEDIA_SECRET);
    assert(sig1 !== sig2);
  });

  it("verifies a valid signature", () => {
    const params = { mediaId: "test123", width: 800, quality: 85 };
    const sig = signMediaUrl(params, TEST_MEDIA_SECRET);
    assert(verifyMediaSignature(params, sig, TEST_MEDIA_SECRET) === true);
  });

  it("rejects an invalid signature", () => {
    const params = { mediaId: "test123" };
    const sig = "0".repeat(64);
    assert(verifyMediaSignature(params, sig, TEST_MEDIA_SECRET) === false);
  });

  it("rejects a signature with wrong mediaId", () => {
    const params1 = { mediaId: "test123" };
    const sig = signMediaUrl(params1, TEST_MEDIA_SECRET);
    const params2 = { mediaId: "test456" };
    assert(verifyMediaSignature(params2, sig, TEST_MEDIA_SECRET) === false);
  });

  it("rejects an empty signature", () => {
    const params = { mediaId: "test123" };
    assert(verifyMediaSignature(params, "", TEST_MEDIA_SECRET) === false);
  });

  it("rejects a malformed signature", () => {
    const params = { mediaId: "test123" };
    assert(verifyMediaSignature(params, "not-hex-at-all", TEST_MEDIA_SECRET) === false);
  });

  it("Cloudinary upload signing produces a valid SHA1 hash", () => {
    const params = { public_id: "test", folder: "app", timestamp: "1234567890" };
    const sig = signCloudinaryUpload(params, TEST_CLOUDINARY_SECRET);
    assert(typeof sig === "string");
    assert(sig.length === 40); // SHA1 hex is 40 chars
  });

  it("Cloudinary signature is deterministic", () => {
    const params = { public_id: "test", folder: "app", timestamp: "1234567890" };
    const sig1 = signCloudinaryUpload(params, TEST_CLOUDINARY_SECRET);
    const sig2 = signCloudinaryUpload(params, TEST_CLOUDINARY_SECRET);
    assert(sig1 === sig2);
  });
});
