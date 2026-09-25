import type { MediaKind } from "@prisma/client";

// Media constraints and configuration. Pure data and pure functions, no
// secrets and no database access, so the picker in the browser can import it
// too to validate a file before it uploads.

const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "avif", "gif"] as const;
const DOCUMENT_FORMATS = ["pdf"] as const;

export const MEDIA_CONFIG = {
  images: {
    formats: IMAGE_FORMATS,
    maxSizeMB: 8,
    maxSizeBytes: 8 * 1024 * 1024,
  },
  documents: {
    formats: DOCUMENT_FORMATS,
    maxSizeMB: 10,
    maxSizeBytes: 10 * 1024 * 1024,
  },
  // Allowed widths for signed /media delivery
  allowedWidths: [200, 400, 600, 800, 1000, 1200, 1600] as const,
  // Allowed JPEG/WebP quality levels
  allowedQualities: [70, 75, 80, 85, 90, 95] as const,
  // Cloudinary upload folder
  uploadFolder: "app",
} as const;

export type { MediaKind };

export function getMediaKind(format: string): MediaKind {
  const lower = format.toLowerCase();
  if (IMAGE_FORMATS.includes(lower as (typeof IMAGE_FORMATS)[number])) return "IMAGE";
  if (DOCUMENT_FORMATS.includes(lower as (typeof DOCUMENT_FORMATS)[number])) return "DOCUMENT";
  throw new Error(`Unsupported format: ${format}`);
}

export function validateMediaFormat(format: string, kind: MediaKind): boolean {
  const lower = format.toLowerCase();
  if (kind === "IMAGE") return IMAGE_FORMATS.includes(lower as (typeof IMAGE_FORMATS)[number]);
  if (kind === "DOCUMENT") return DOCUMENT_FORMATS.includes(lower as (typeof DOCUMENT_FORMATS)[number]);
  return false;
}

export function getMaxSizeBytes(kind: MediaKind): number {
  return kind === "IMAGE" ? MEDIA_CONFIG.images.maxSizeBytes : MEDIA_CONFIG.documents.maxSizeBytes;
}
