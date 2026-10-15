import "server-only";

import { LEGACY_ACCOUNT_ID } from "@sahan-sac/media-kit/accounts";
import { contentTypeFor, getMediaKind } from "@sahan-sac/media-kit/config";
import { withFailover } from "@sahan-sac/media-kit/storage";
import { validateMediaUpload, validateMediaMetadata } from "@sahan-sac/media-kit/validation";

import { audit } from "@/lib/admin/audit";
import { repos, withTx, type Repos } from "@/lib/data";
import { log } from "@/lib/log";
import { fileStore } from "@/lib/media/files";
import { MEDIA_UPLOAD_FOLDER } from "@/lib/media/folder";
import { candidatesFor, findAccount, forgetUsage, markFull, providerOf } from "@/lib/media/storage";
import { normalizeTags } from "@/lib/media/tags";

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
  /** The storage account the browser uploaded to; omitted means the legacy Cloudinary account. */
  accountId?: string;
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
  warning?: string;
  usages?: Array<{ entityType: string; entityId: string; field: string }>;
}

export interface RecordUsageInput {
  mediaId: string;
  entityType: string;
  entityId: string;
  field: string;
}

// Register a file the browser uploaded to one storage account: read what is
// really stored there, validate it, create the DB row. A file that fails
// validation is deleted from that account again.
// Alt text is required for images and must be set immediately after upload (validated by recordMediaUsage).
export async function registerUpload(
  input: RegisterUploadInput,
  actor: { id: string; email: string }
): Promise<{ ok: false; error: string } | { ok: true; asset: { id: string; url: string } }> {
  const { publicId, folder, alt } = input;
  const account = findAccount(input.accountId ?? LEGACY_ACCOUNT_ID);
  if (!account) return { ok: false, error: "That storage account is not configured on this server." };
  const store = fileStore(account);
  const provider = providerOf(account);
  // Refuses the registration and removes the file, but only a file in the
  // upload folder that no row owns: the caller names the file, so it may be
  // a live asset's file or one this app never uploaded. A failed ownership
  // lookup counts as owned, so the file is kept.
  const discard = async (error: string) => {
    const owned = await repos.media.existsByPublicId(provider, account.id, publicId).catch(() => true);
    if (!owned) {
      await store.remove(publicId).catch((cleanupError: unknown) => log.warn("media register cleanup failed", { accountId: account.id, publicId, error: String(cleanupError) }));
    }
    return { ok: false as const, error };
  };

  try {
    const stored = await store.inspect(publicId);
    if (!stored) return { ok: false, error: "The uploaded file was not found in the media store. The upload may have failed." };

    // The file must be in the upload folder, and the caller must say so too.
    // A file anywhere else was not uploaded through this library: refuse it
    // and leave it alone.
    if (stored.folder !== MEDIA_UPLOAD_FOLDER) return { ok: false, error: `File uploaded to wrong folder: ${stored.folder}` };
    if (folder !== MEDIA_UPLOAD_FOLDER) return discard("Folder parameter does not match the stored folder");

    let mediaKind;
    try {
      mediaKind = getMediaKind(stored.format);
    } catch {
      return discard(`File type .${stored.format} is not supported`);
    }

    const validation = validateMediaUpload(`file.${stored.format}`, stored.bytes, folder);
    if (!validation.ok) return discard(validation.errors?.[0]?.message || "File validation failed");

    const metadataValidation = validateMediaMetadata(alt, undefined, mediaKind);
    if (!metadataValidation.ok) return discard(metadataValidation.errors?.[0]?.message || "Alt text is required for images.");

    // Create the asset record and its audit row atomically: the store work
    // (inspect, validate, and any cleanup delete above) is already done by
    // this point, so nothing here can leave an audit row for an upload that
    // did not actually get registered.
    const asset = await withTx(async (tx) => {
      const created = await tx.media.create({
        provider,
        accountId: account.id,
        kind: mediaKind,
        publicId,
        url: stored.url,
        format: stored.format,
        width: stored.width,
        height: stored.height,
        sizeBytes: stored.bytes,
        alt: alt || (mediaKind === "IMAGE" ? "" : null), // Empty string for image, null for document
        folder,
        createdById: actor.id,
      });

      await audit(
        {
          action: "media.uploaded",
          actor,
          entityType: "MediaAsset",
          entityId: created.id,
          after: { accountId: account.id, publicId, format: stored.format, sizeBytes: stored.bytes },
        },
        tx
      );

      return created;
    });

    forgetUsage();
    return { ok: true, asset: { id: asset.id, url: asset.url } };
  } catch (error) {
    log.error("media register failed", { accountId: account.id, publicId, error: error instanceof Error ? error.message : String(error) });
    // The file is already stored. Delete it only when no row owns it: a
    // unique violation means one does, and so may a transaction that
    // committed before the connection failed, or an earlier registration of
    // the same file (inspect failing before any write). When the check
    // itself fails, keep the file: an orphan is cheaper than a broken asset.
    const owned =
      (error as { code?: unknown } | null)?.code === "P2002" ||
      (await repos.media.existsByPublicId(provider, account.id, publicId).catch(() => true));
    if (!owned) {
      const deleted = await store.remove(publicId).catch((cleanupError: unknown) => {
        log.warn("media register cleanup failed", { accountId: account.id, publicId, error: String(cleanupError) });
        return null;
      });
      if (deleted === false) log.warn("media register cleanup failed", { accountId: account.id, publicId, error: "The store refused the delete" });
    }
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
}

/**
 * Stores an AI-generated image (already in memory, never a browser file) on
 * the first storage account that takes it, moving on past full or failing
 * accounts, and registers it as a MediaAsset the same way registerUpload()
 * does for a browser upload, so a generated image is a real, reusable media
 * asset with required alt text, not a one-off URL the post alone knows
 * about.
 */
export async function registerGeneratedImage(
  input: RegisterGeneratedImageInput,
  actor: { id: string; email: string }
): Promise<{ ok: false; error: string } | { ok: true; asset: { id: string; url: string } }> {
  const format = IMAGE_MIME_FORMATS[input.mimeType.toLowerCase()];
  const contentType = format ? contentTypeFor(format) : null;
  if (!format || !contentType) return { ok: false, error: `Unsupported image type: ${input.mimeType}` };

  const altValidation = validateMediaMetadata(input.alt, input.title, "IMAGE");
  if (!altValidation.ok) {
    return { ok: false, error: altValidation.errors?.[0]?.message || "Invalid alt text" };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(input.base64, "base64");
  } catch {
    return { ok: false, error: "The generated image data was invalid." };
  }

  const sizeValidation = validateMediaUpload(`generated.${format}`, bytes.length, input.folder);
  if (!sizeValidation.ok) {
    return { ok: false, error: sizeValidation.errors?.[0]?.message || "Generated image failed validation" };
  }

  let placed;
  try {
    placed = await withFailover(await candidatesFor(bytes.length), (account) => fileStore(account).put({ bytes, format, contentType, folder: input.folder }), {
      onFull: (account) => markFull(account),
      onProblem: (message, meta) => log.warn(message, meta),
    });
  } catch (error) {
    log.error("generated image upload failed", { error: error instanceof Error ? error.message : String(error) });
    return { ok: false, error: "Uploading the generated image to the media store failed." };
  }
  const { account, value: stored } = placed;

  // Create the row and its audit entry atomically so a rolled-back write
  // never leaves an audit row behind, matching registerUpload()'s transaction
  // above. If that fails, the stored file is removed again rather than left
  // as an orphan no MediaAsset row points at.
  let asset: { id: string; url: string };
  try {
    asset = await withTx(async (tx) => {
      const created = await tx.media.create({
        provider: providerOf(account),
        accountId: account.id,
        kind: "IMAGE",
        publicId: stored.publicId,
        url: stored.url,
        format: stored.format || format,
        width: stored.width,
        height: stored.height,
        sizeBytes: stored.bytes,
        alt: input.alt,
        title: input.title || null,
        folder: input.folder,
        createdById: actor.id,
      });

      await audit(
        {
          action: "media.ai_generated",
          actor,
          entityType: "MediaAsset",
          entityId: created.id,
          after: { accountId: account.id, publicId: stored.publicId, format: created.format, sizeBytes: created.sizeBytes },
        },
        tx
      );

      return created;
    });
  } catch (error) {
    log.error("register generated image failed", { error: error instanceof Error ? error.message : String(error) });
    await fileStore(account).remove(stored.publicId).catch(() => false);
    return { ok: false, error: "The image uploaded but could not be saved to the media library." };
  }

  forgetUsage();
  return { ok: true, asset: { id: asset.id, url: asset.url } };
}

// Update media metadata (alt, title, tags)
export async function updateMediaMetadata(
  input: UpdateMediaInput,
  actor: { id: string; email: string }
): Promise<{ ok: false; error: string } | { ok: true }> {
  const asset = await repos.media.find(input.mediaId);

  if (!asset) return { ok: false, error: "Media not found" };

  // Validate metadata
  const validation = validateMediaMetadata(input.alt ?? asset.alt, input.title ?? asset.title, asset.kind);
  if (!validation.ok) {
    return { ok: false, error: validation.errors?.[0]?.message || "Invalid metadata" };
  }

  const before = {
    alt: asset.alt,
    title: asset.title,
    tags: asset.tags,
  };

  await withTx(async (tx) => {
    const updated = await tx.media.updateMetadata(input.mediaId, {
      alt: input.alt ?? asset.alt,
      title: input.title ?? asset.title,
      tags: input.tags ? normalizeTags(input.tags) : asset.tags,
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
/**
 * Moves an unused asset to the trash: its row goes, a snapshot stays for
 * TRASH_DAYS, and its Cloudinary file is kept until the trash is purged
 * (lib/cron/jobs.ts), so a restore brings back a working asset.
 */
export async function deleteMedia(mediaId: string, actor: { id: string; email: string }): Promise<DeleteMediaResult> {
  const outcome = await withTx(async (tx) => {
    // Lock, check and delete in one transaction. The row lock comes before
    // the usage read: a content save that already inserted its MediaUsage
    // holds a key-share lock, so this waits for it to commit and then sees
    // the usage; a save that starts later waits for this delete and then
    // fails its foreign key, rolling back its own content mutation. Reading
    // usages before the lock would let a save slip in between, and the
    // cascade on media_usages would then drop its usage row silently.
    await tx.media.lockForUpdate(mediaId);
    const asset = await tx.media.findWithUsages(mediaId);
    if (!asset) return { kind: "missing" as const };
    if (asset.usages.length > 0) {
      return {
        kind: "in_use" as const,
        usages: asset.usages.map((u) => ({ entityType: u.entityType, entityId: u.entityId, field: u.field })),
      };
    }

    const { usages: _usages, ...row } = asset;
    await tx.trash.put([{ entityType: "MediaAsset", entityId: mediaId, label: row.title || row.alt || row.publicId || row.url, data: { asset: row }, deletedById: actor.id }]);
    await tx.media.delete(mediaId);

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
    return { kind: "deleted" as const };
  });

  if (outcome.kind === "missing") return { ok: false, error: "Media not found" };
  if (outcome.kind === "in_use") {
    return { ok: false, error: "This media is used elsewhere and cannot be deleted", usages: outcome.usages };
  }
  forgetUsage();
  return { ok: true };
}

// Record a media usage (call from content/collection editors)
export async function recordMediaUsage(
  tx: Pick<Repos, "media">,
  input: RecordUsageInput
): Promise<void> {
  await tx.media.recordUsage({ mediaId: input.mediaId, entityType: input.entityType, entityId: input.entityId, field: input.field });
}

// Clear all usages for an entity (call when deleting/updating content)
export async function clearMediaUsage(
  tx: Pick<Repos, "media">,
  entityType: string,
  entityId: string
): Promise<void> {
  await tx.media.clearUsage(entityType, entityId);
}
