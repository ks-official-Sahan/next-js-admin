import "server-only";

import { LEGACY_ACCOUNT_ID } from "@sahan-sac/media-kit/accounts";

import { fileStore } from "@/lib/media/files";
import { findAccount } from "@/lib/media/storage";

/** The stored file behind a trashed media snapshot: the account that holds it and its id there. */
export interface TrashedFile {
  accountId: string;
  publicId: string;
}

const STORED = new Set(["CLOUDINARY", "S3", "R2"]);

/** The stored file behind a trashed media snapshot, if it has one to delete. */
export function trashedFile(data: unknown): TrashedFile | null {
  const asset = (data as { asset?: { provider?: string; accountId?: string; publicId?: string | null } } | null)?.asset;
  if (!asset?.provider || !STORED.has(asset.provider) || !asset.publicId) return null;
  // Snapshots taken before accounts existed belong to the legacy Cloudinary account.
  return { accountId: asset.accountId || LEGACY_ACCOUNT_ID, publicId: asset.publicId };
}

/**
 * Deletes a purged asset's file from the account that holds it, and only
 * there. Throws when the account is no longer configured or refuses, so the
 * snapshot stays and the purge is retried instead of orphaning the file.
 */
export async function deleteTrashedFile(file: TrashedFile): Promise<void> {
  const account = findAccount(file.accountId);
  if (!account) throw new Error(`Storage account ${file.accountId} is not configured`);
  if (!(await fileStore(account).remove(file.publicId))) throw new Error(`Storage account ${file.accountId} refused the delete`);
}
