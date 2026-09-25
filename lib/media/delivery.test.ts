import assert from "node:assert/strict";
import { test } from "node:test";

import { cloudinaryImageUrl, cloudinarySrcSet } from "./delivery";

const ORIGINAL = "https://res.cloudinary.com/demo/image/upload/v1712345678/blog/cover.png";

test("adds auto format and quality, and a no-upscale width limit", () => {
  assert.equal(
    cloudinaryImageUrl(ORIGINAL, { width: 800 }),
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_800,c_limit/v1712345678/blog/cover.png"
  );
  assert.equal(
    cloudinaryImageUrl(ORIGINAL),
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1712345678/blog/cover.png"
  );
});

test("a fixed box crops around the subject and can force a format", () => {
  assert.equal(
    cloudinaryImageUrl(ORIGINAL, { width: 1200, height: 630, format: "jpg" }),
    "https://res.cloudinary.com/demo/image/upload/f_jpg,q_auto,w_1200,h_630,c_fill,g_auto/v1712345678/blog/cover.png"
  );
});

test("leaves other hosts, local paths, videos and already-transformed URLs unchanged", () => {
  for (const url of [
    "/icons/icon-512.png",
    "https://example.com/image/upload/a.png",
    "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
    "https://res.cloudinary.com/demo/image/upload/w_400/v1/a.png",
  ]) {
    assert.equal(cloudinaryImageUrl(url, { width: 800 }), url);
  }
});

test("srcset lists each width, and is undefined for non-Cloudinary images", () => {
  assert.equal(
    cloudinarySrcSet(ORIGINAL, [640, 1280]),
    [
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_640,c_limit/v1712345678/blog/cover.png 640w",
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1280,c_limit/v1712345678/blog/cover.png 1280w",
    ].join(", ")
  );
  assert.equal(cloudinarySrcSet("/local.png", [640]), undefined);
});
