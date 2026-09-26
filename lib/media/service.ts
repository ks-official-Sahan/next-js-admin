import "server-only";

import type { Prisma } from "@prisma/client";

import { audit } from "@/lib/admin/audit";
import { db } from "@/lib/db/prisma";
import { log } from "@/lib/log";

import { MEDIA_CONFIG, getMediaKind } from "./config";
import type { CloudinaryClient } from "./cloudinary";
import { validateMediaUpload, validateMediaMetadata } from "./validation";

const IMAGE_MIME_FORMATS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export interface RegisterUploadInput {
  publicId: string;
  folder: string;
  alt?: string;
  cloudinaryClient: CloudinaryClient;
}

export interface UpdateMediaInput {
  mediaId: string;
  alt?: string | null;
  title?: string | null;
  tags?: string[];
}

export interface DeleteMediaResult {
  ok: boolean;
  error?: string;
  usages?: Array<{ entityType: string; entityId: string; field: string }>;
}

export interface RecordUsageInput {
  mediaId: string;
  entityType: string;
  entityId: string;
  field: string;
}

// Register an uploaded asset from Cloudinary: fetch metadata, validate, create DB row.
// If validation fails, delete the asset from Cloudinary and return error.
// Alt text is required for images and must be set immediately after upload (validated by recordMediaUsage).
export async function registerUpload(
  input: RegisterUploadInput,
  actor: { id: string; email: string }
): Promise<{ ok: false; error: string } | { ok: true; asset: { id: string; url: string } }> {
  const { publicId, folder, alt, cloudinaryClient } = input;

  try {
    // Fetch asset metadata from Cloudinary Admin API
    const cloudinaryAsset = await cloudinaryClient.getAsset(publicId);
    if (!cloudinaryAsset) {
      return { ok: false, error: "Asset not found in Cloudinary. Upload may have failed." };
    }

    // Validate folder matches upload folder (safety check)
    if (cloudinaryAsset.folder !== MEDIA_CONFIG.uploadFolder) {
      await cloudinaryClient.deleteAsset(publicId);
      return { ok: false, error: `File uploaded to wrong folder: ${cloudinaryAsset.folder}` };
    }

    // Validate folder parameter matches
    if (folder !== MEDIA_CONFIG.uploadFolder) {
      await cloudinaryClient.deleteAsset(publicId);
      return { ok: false, error: `Folder parameter does not match Cloudinary folder` };
    }

    // Determine media kind and validate type and size
    let mediaKind;
    try {
      mediaKind = getMediaKind(cloudinaryAsset.format);
    } catch {
      await cloudinaryClient.deleteAsset(publicId);
      return { ok: false, error: `File type .${cloudinaryAsset.format} is not supported` };
    }

    const validation = validateMediaUpload(
      `file.${cloudinaryAsset.format}`,
      cloudinaryAsset.bytes,
      folder
    );
    if (!validation.ok) {
      await cloudinaryClient.deleteAsset(publicId);
      const errorMsg = validation.errors?.[0]?.message || "File validation failed";
      return { ok: false, error: errorMsg };
    }

    // Create the asset record and its audit row atomically: Cloudinary work
    // (fetch, validate, and any cleanup delete above) is already done by this
    // point, so nothing here can leave an audit row for an upload that did
    // not actually get registered.
    const asset = await db.$transaction(async (tx) => {
      const created = await tx.mediaAsset.create({
        data: {
          provider: "CLOUDINARY",
          kind: mediaKind,
          publicId,
          url: cloudinaryAsset.secure_url,
          format: cloudinaryAsset.format,
          width: cloudinaryAsset.width,
          height: cloudinaryAsset.height,
          sizeBytes: cloudinaryAsset.bytes,
          alt: alt || (mediaKind === "IMAGE" ? "" : null), // Empty string for image, null for document
          folder,
          createdById: actor.id,
        },
      });

      await audit(
        {
          action: "media.uploaded",
          actor,
          entityType: "MediaAsset",
          entityId: created.id,
          after: { publicId, format: cloudinaryAsset.format, sizeBytes: cloudinaryAsset.bytes },
        },
        tx
      );

      return created;
    });

    return { ok: true, asset: { id: asset.id, url: asset.url } };
  } catch (error) {
    return { ok: false, error: "Failed to register uploaded media" };
  }
}

export interface RegisterGeneratedImageInput {
  /** Raw base64 image bytes (no "data:" prefix), as returned by lib/ai/image.ts. */
  base64: string;
  mimeType: string;
  alt: string;
  title?: string;
  folder: string;
  cloudinaryClient: CloudinaryClient;
}

/**
 * Uploads an AI-generated image (already in memory, never a browser file) to
 * Cloudinary and registers it as a MediaAsset, the same way registerUpload()
 * does for a widget upload — so a generated image is a real, reusable media
 * asset with required alt text, not a one-off URL the post alone knows
 * about.
 */
export async function registerGeneratedImage(
  input: RegisterGeneratedImageInput,
  actor: { id: string; email: string }
): Promise<{ ok: false; error: string } | { ok: true; asset: { id: string; url: string } }> {
  const format = IMAGE_MIME_FORMATS[input.mimeType.toLowerCase()];
  if (!format) return { ok: false, error: `Unsupported image type: ${input.mimeType}` };

  const altValidation = validateMediaMetadata(input.alt, input.title, "IMAGE");
  if (!altValidation.ok) {
    return { ok: false, error: altValidation.errors?.[0]?.message || "Invalid alt text" };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(input.base64, "base64");
  } catch {
    return { ok: false, error: "The generated image data was invalid." };
  }

  const sizeValidation = validateMediaUpload(`generated.${format}`, buffer.length, input.folder);
  if (!sizeValidation.ok) {
    return { ok: false, error: sizeValidation.errors?.[0]?.message || "Generated image failed validation" };
  }

  const uploaded = await input.cloudinaryClient.uploadBase64({
    dataUri: `data:${input.mimeType};base64,${input.base64}`,
    folder: input.folder,
  });
  if (!uploaded) return { ok: false, error: "Uploading the generated image to the media store failed." };

  // Create the row and its audit entry atomically so a rolled-back write
  // never leaves an audit row behind, matching registerUpload()'s transaction
  // above. If that fails, the Cloudinary upload is removed again rather than
  // left as an orphan no MediaAsset row points at.
  let asset: { id: string; url: string };
  try {
    asset = await db.$transaction(async (tx) => {
    const created = await tx.mediaAsset.create({
      data: {
        provider: "CLOUDINARY",
        kind: "IMAGE",
        publicId: uploaded.public_id,
        url: uploaded.secure_url,
        format: uploaded.format || format,
        width: uploaded.width,
        height: uploaded.height,
        sizeBytes: uploaded.bytes || buffer.length,
        alt: input.alt,
        title: input.title || null,
        folder: input.folder,
        createdById: actor.id,
      },
    });

    await audit(
      {
        action: "media.ai_generated",
        actor,
        entityType: "MediaAsset",
        entityId: created.id,
        after: { publicId: uploaded.public_id, format: created.format, sizeBytes: created.sizeBytes },
      },
      tx
    );

    return created;
  });
  } catch (error) {
    log.error("register generated image failed", { error: error instanceof Error ? error.message : String(error) });
    await input.cloudinaryClient.deleteAsset(uploaded.public_id);
    return { ok: false, error: "The image uploaded but could not be saved to the media library." };
  }

  return { ok: true, asset: { id: asset.id, url: asset.url } };
}

// Update media metadata (alt, title, tags)
export async function updateMediaMetadata(
  input: UpdateMediaInput,
  actor: { id: string; email: string }
): Promise<{ ok: false; error: string } | { ok: true }> {
  const asset = await db.mediaAsset.findUnique({
    where: { id: input.mediaId },
  });

  if (!asset) return { ok: false, error: "Media not found" };

  // Validate metadata
  const validation = validateMediaMetadata(input.alt, input.title, asset.kind);
  if (!validation.ok) {
    return { ok: false, error: validation.errors?.[0]?.message || "Invalid metadata" };
  }

  const before = {
    alt: asset.alt,
    title: asset.title,
    tags: asset.tags,
  };

  await db.$transaction(async (tx) => {
    const updated = await tx.mediaAsset.update({
      where: { id: input.mediaId },
      data: {
        alt: input.alt ?? asset.alt,
        title: input.title ?? asset.title,
        tags: input.tags ?? asset.tags,
      },
    });

    await audit(
      {
        action: "media.updated",
        actor,
        entityType: "MediaAsset",
        entityId: input.mediaId,
        before,
        after: {
          alt: updated.alt,
          title: updated.title,
          tags: updated.tags,
        },
      },
      tx
    );
  });

  return { ok: true };
}

// Delete media asset only if it's not in use.
// For CLOUDINARY assets, delete from Cloudinary first (before DB delete in case of error).
// For LOCAL assets, no external cleanup needed.
export async function deleteMedia(
  mediaId: string,
  actor: { id: string; email: string },
  cloudinaryClient?: CloudinaryClient
): Promise<DeleteMediaResult> {
  const asset = await db.mediaAsset.findUnique({
    where: { id: mediaId },
    include: { usages: true },
  });

  if (!asset) return { ok: false, error: "Media not found" };

  if (asset.usages.length > 0) {
    return {
      ok: false,
      error: "This media is used elsewhere and cannot be deleted",
      usages: asset.usages.map((u) => ({
        entityType: u.entityType,
        entityId: u.entityId,
        field: u.field,
      })),
    };
  }

  // Delete from Cloudinary first (if applicable) — external call stays
  // outside the DB transaction, and runs before it, so a Cloudinary failure
  // here never reaches the DB delete or its audit row.
  if (asset.provider === "CLOUDINARY" && asset.publicId && cloudinaryClient) {
    await cloudinaryClient.deleteAsset(asset.publicId);
  }

  // Then delete from the database and audit it atomically.
  await db.$transaction(async (tx) => {
    await tx.mediaAsset.delete({ where: { id: mediaId } });

    await audit(
      {
        action: "media.deleted",
        actor,
        entityType: "MediaAsset",
        entityId: mediaId,
        before: {
          provider: asset.provider,
          url: asset.url,
          publicId: asset.publicId,
          folder: asset.folder,
        },
      },
      tx
    );
  });

  return { ok: true };
}

// Record a media usage (call from content/collection editors)
export async function recordMediaUsage(
  tx: Prisma.TransactionClient | typeof db,
  input: RecordUsageInput
): Promise<void> {
  await tx.mediaUsage.upsert({
    where: {
      mediaId_entityType_entityId_field: {
        mediaId: input.mediaId,
        entityType: input.entityType,
        entityId: input.entityId,
        field: input.field,
      },
    },
    update: {},
    create: {
      mediaId: input.mediaId,
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
    },
  });
}

// Clear all usages for an entity (call when deleting/updating content)
export async function clearMediaUsage(
  tx: Prisma.TransactionClient | typeof db,
  entityType: string,
  entityId: string
): Promise<void> {
  await tx.mediaUsage.deleteMany({
    where: { entityType, entityId },
  });
}
