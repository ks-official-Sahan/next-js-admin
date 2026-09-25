import "server-only";

import { readdir, stat } from "fs/promises";
import { join, extname } from "path";

import type { Prisma } from "@prisma/client";

import { MEDIA_CONFIG } from "./config";

// Scan directories and register LOCAL media assets idempotently.
// Parses image headers for width/height where possible, falls back to null.
// Does not require new dependencies.

export interface LocalMediaAsset {
  url: string;
  sizeBytes: number;
  format: string; // Validated to be in MEDIA_CONFIG.images.formats
  width: number | null;
  height: number | null;
  alt: string;
  title?: string;
  folder: string;
}

const IMAGE_EXTENSIONS: Set<string> = new Set(MEDIA_CONFIG.images.formats);

// Simple JPEG/PNG header parsing to extract dimensions
async function getImageDimensions(path: string): Promise<{ width: number; height: number } | null> {
  try {
    const { readFile } = await import("fs/promises");
    const buffer = await readFile(path);

    // JPEG: look for SOF marker (0xFFC0-0xFFC3)
    for (let i = 0; i < buffer.length - 8; i++) {
      if (buffer[i] === 0xff && (buffer[i + 1] & 0xf0) === 0xc0) {
        const height = (buffer[i + 5] << 8) | buffer[i + 6];
        const width = (buffer[i + 7] << 8) | buffer[i + 8];
        if (width > 0 && height > 0) return { width, height };
      }
    }

    // PNG: dimensions at offset 16-24
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
    }

    return null;
  } catch {
    return null;
  }
}

// Scan a directory and return media files
async function scanDirectory(dirPath: string, publicUrlPrefix: string): Promise<LocalMediaAsset[]> {
  const assets: LocalMediaAsset[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subAssets = await scanDirectory(fullPath, `${publicUrlPrefix}/${entry.name}`);
        assets.push(...subAssets);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase().slice(1);
        if (!IMAGE_EXTENSIONS.has(ext)) continue;

        const fileStat = await stat(fullPath);
        const dimensions = await getImageDimensions(fullPath);

        // ext is validated above via IMAGE_EXTENSIONS
        const asset: LocalMediaAsset = {
          url: `${publicUrlPrefix}/${entry.name}`,
          sizeBytes: fileStat.size,
          format: ext,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          alt: "",
          folder: publicUrlPrefix.split("/").pop() || "uncategorized",
        };
        assets.push(asset);
      }
    }
  } catch {
    // Directory doesn't exist or is unreadable, skip
  }

  return assets;
}

// Main seed function: scan directories and register assets with db
export async function seedMediaAssets(
  db: { mediaAsset: { upsert: (args: Prisma.MediaAssetUpsertArgs) => Promise<unknown> } },
  basePublicDir: string
): Promise<{ created: number; skipped: number }> {
  const allAssets: LocalMediaAsset[] = [];

  // Scan /public/works directory
  const workAssets = await scanDirectory(join(basePublicDir, "works"), "/works");
  allAssets.push(...workAssets);

  // Could add other directories here: /about, /updates, etc.

  let created = 0;
  let skipped = 0;

  for (const asset of allAssets) {
    try {
      await db.mediaAsset.upsert({
        where: {
          provider_publicId: {
            provider: "LOCAL",
            publicId: asset.url, // Use URL as publicId for local assets
          },
        },
        create: {
          provider: "LOCAL",
          kind: "IMAGE",
          publicId: asset.url,
          url: asset.url,
          format: asset.format,
          width: asset.width,
          height: asset.height,
          sizeBytes: asset.sizeBytes,
          alt: asset.alt,
          title: asset.title,
          folder: asset.folder,
        },
        update: {}, // Idempotent: don't update existing entries
      });
      created++;
    } catch {
      skipped++;
    }
  }

  return { created, skipped };
}
