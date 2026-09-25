import "server-only";

import type { MediaKind } from "@prisma/client";

import { MEDIA_CONFIG } from "./config";

export interface ValidationError {
  field: string;
  message: string;
}

export interface MediaValidation {
  ok: boolean;
  errors?: ValidationError[];
}

// Validate a media asset upload or change
export function validateMediaUpload(
  filename: string,
  sizeBytes: number,
  folder: string
): MediaValidation {
  const errors: ValidationError[] = [];

  // Extract format from filename
  const parts = filename.toLowerCase().split(".");
  const format = parts[parts.length - 1] || "";

  // SVG is explicitly refused
  if (format === "svg") {
    errors.push({ field: "file", message: "SVG files are not allowed" });
    return { ok: false, errors };
  }

  // Check if format is in images
  const isImage = MEDIA_CONFIG.images.formats.includes(format as (typeof MEDIA_CONFIG.images.formats)[number]);
  const isDocument = MEDIA_CONFIG.documents.formats.includes(format as (typeof MEDIA_CONFIG.documents.formats)[number]);

  if (!isImage && !isDocument) {
    errors.push({
      field: "file",
      message: `File type .${format} is not allowed. Allowed: ${[...MEDIA_CONFIG.images.formats, ...MEDIA_CONFIG.documents.formats].join(", ")}`,
    });
  }

  // Check file size
  const maxSize = isImage ? MEDIA_CONFIG.images.maxSizeBytes : MEDIA_CONFIG.documents.maxSizeBytes;
  const maxSizeMB = isImage ? MEDIA_CONFIG.images.maxSizeMB : MEDIA_CONFIG.documents.maxSizeMB;

  if (sizeBytes > maxSize) {
    errors.push({
      field: "file",
      message: `File is too large (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum: ${maxSizeMB} MB`,
    });
  }

  // Validate folder
  if (!folder || folder.trim() === "") {
    errors.push({ field: "folder", message: "Folder is required" });
  } else if (!isValidFolder(folder)) {
    errors.push({ field: "folder", message: "Invalid folder name" });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// Validate media metadata updates
export function validateMediaMetadata(
  alt: string | null | undefined,
  title: string | null | undefined,
  kind: MediaKind
): MediaValidation {
  const errors: ValidationError[] = [];

  // Alt text is required for images
  if (kind === "IMAGE" && (!alt || alt.trim() === "")) {
    errors.push({ field: "alt", message: "Alt text is required for images" });
  }

  // Alt text length limit
  if (alt && alt.length > 500) {
    errors.push({ field: "alt", message: "Alt text must be 500 characters or less" });
  }

  // Title length limit
  if (title && title.length > 200) {
    errors.push({ field: "title", message: "Title must be 200 characters or less" });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// Check if a folder name is valid (alphanumeric, hyphens, underscores, forward slashes)
function isValidFolder(folder: string): boolean {
  return /^[a-z0-9/_-]+$/i.test(folder);
}

// Validate a width is in the allowed list
export function isAllowedWidth(width: number): boolean {
  return MEDIA_CONFIG.allowedWidths.includes(width as (typeof MEDIA_CONFIG.allowedWidths)[number]);
}

// Validate a quality is in the allowed list
export function isAllowedQuality(quality: number): boolean {
  return MEDIA_CONFIG.allowedQualities.includes(quality as (typeof MEDIA_CONFIG.allowedQualities)[number]);
}
