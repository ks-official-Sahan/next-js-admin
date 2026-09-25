import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import { validateMediaUpload, validateMediaMetadata, isAllowedWidth, isAllowedQuality } from "./validation";

describe("Media validation", () => {
  describe("validateMediaUpload", () => {
    it("accepts a valid JPG", () => {
      const result = validateMediaUpload("photo.jpg", 1024 * 1024, "photos");
      assert(result.ok === true);
    });

    it("accepts a valid PNG", () => {
      const result = validateMediaUpload("icon.png", 512 * 1024, "icons");
      assert(result.ok === true);
    });

    it("accepts a valid PDF", () => {
      const result = validateMediaUpload("document.pdf", 2 * 1024 * 1024, "docs");
      assert(result.ok === true);
    });

    it("rejects SVG files", () => {
      const result = validateMediaUpload("logo.svg", 100 * 1024, "images");
      assert(result.ok === false);
      assert(result.errors?.[0]?.message.includes("SVG"));
    });

    it("rejects unsupported formats", () => {
      const result = validateMediaUpload("file.exe", 1024, "files");
      assert(result.ok === false);
      assert(result.errors?.[0]?.message.includes("not allowed"));
    });

    it("rejects images that exceed 8 MB", () => {
      const result = validateMediaUpload("large.jpg", 9 * 1024 * 1024, "images");
      assert(result.ok === false);
      assert(result.errors?.[0]?.message.includes("too large"));
    });

    it("rejects documents that exceed 10 MB", () => {
      const result = validateMediaUpload("large.pdf", 11 * 1024 * 1024, "docs");
      assert(result.ok === false);
      assert(result.errors?.[0]?.message.includes("too large"));
    });

    it("accepts the maximum size for images", () => {
      const result = validateMediaUpload("big.jpg", 8 * 1024 * 1024, "images");
      assert(result.ok === true);
    });

    it("accepts the maximum size for documents", () => {
      const result = validateMediaUpload("big.pdf", 10 * 1024 * 1024, "docs");
      assert(result.ok === true);
    });

    it("rejects empty folder", () => {
      const result = validateMediaUpload("file.jpg", 1024, "");
      assert(result.ok === false);
      assert(result.errors?.some((e) => e.field === "folder"));
    });

    it("rejects invalid folder names", () => {
      const result = validateMediaUpload("file.jpg", 1024, "folder with spaces");
      assert(result.ok === false);
      assert(result.errors?.some((e) => e.field === "folder"));
    });

    it("accepts valid folder names with hyphens and underscores", () => {
      const result = validateMediaUpload("file.jpg", 1024, "my-folder_123");
      assert(result.ok === true);
    });

    it("accepts valid folder paths with slashes", () => {
      const result = validateMediaUpload("file.jpg", 1024, "projects/2024");
      assert(result.ok === true);
    });
  });

  describe("validateMediaMetadata", () => {
    it("accepts image with alt text", () => {
      const result = validateMediaMetadata("A beautiful photo", "Photo Title", "IMAGE");
      assert(result.ok === true);
    });

    it("rejects image without alt text", () => {
      const result = validateMediaMetadata("", "Photo", "IMAGE");
      assert(result.ok === false);
      assert(result.errors?.[0]?.field === "alt");
    });

    it("rejects image with null alt text", () => {
      const result = validateMediaMetadata(null, "Photo", "IMAGE");
      assert(result.ok === false);
      assert(result.errors?.[0]?.field === "alt");
    });

    it("allows document without alt text", () => {
      const result = validateMediaMetadata("", "Document Title", "DOCUMENT");
      assert(result.ok === true);
    });

    it("rejects alt text over 500 chars", () => {
      const longAlt = "a".repeat(501);
      const result = validateMediaMetadata(longAlt, "Title", "IMAGE");
      assert(result.ok === false);
      assert(result.errors?.some((e) => e.field === "alt"));
    });

    it("accepts alt text at 500 chars", () => {
      const longAlt = "a".repeat(500);
      const result = validateMediaMetadata(longAlt, "Title", "IMAGE");
      assert(result.ok === true);
    });

    it("rejects title over 200 chars", () => {
      const longTitle = "a".repeat(201);
      const result = validateMediaMetadata("Alt text", longTitle, "IMAGE");
      assert(result.ok === false);
      assert(result.errors?.some((e) => e.field === "title"));
    });

    it("accepts title at 200 chars", () => {
      const longTitle = "a".repeat(200);
      const result = validateMediaMetadata("Alt text", longTitle, "IMAGE");
      assert(result.ok === true);
    });
  });

  describe("allowedWidths and qualities", () => {
    it("allows configured widths", () => {
      assert(isAllowedWidth(200) === true);
      assert(isAllowedWidth(600) === true);
      assert(isAllowedWidth(1200) === true);
      assert(isAllowedWidth(1600) === true);
    });

    it("rejects non-configured widths", () => {
      assert(isAllowedWidth(300) === false);
      assert(isAllowedWidth(500) === false);
      assert(isAllowedWidth(2000) === false);
    });

    it("allows configured qualities", () => {
      assert(isAllowedQuality(70) === true);
      assert(isAllowedQuality(85) === true);
      assert(isAllowedQuality(95) === true);
    });

    it("rejects non-configured qualities", () => {
      assert(isAllowedQuality(60) === false);
      assert(isAllowedQuality(100) === false);
    });
  });
});
