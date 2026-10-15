import "server-only";

import type { StorageAccount } from "@sahan-sac/media-kit/accounts";
import { deleteObject, headObject, newObjectKey, objectPublicUrl, putObject } from "@sahan-sac/media-kit/bucket";
import { StorageError } from "@sahan-sac/media-kit/storage";

import { cloudinaryFor, isBucket } from "@/lib/media/storage";

// The same three operations on any storage account, so the media service,
// the trash purge and generated images never branch on the provider:
// - inspect: what is really stored under a public id (Cloudinary) or object
//   key (S3/R2), read from the account itself, never from the browser;
// - remove: delete it (true when gone, including already gone);
// - put: store bytes the server already holds, under a fresh id.

export interface StoredFile {
  url: string;
  format: string;
  width: number | null;
  height: number | null;
  bytes: number;
  folder: string;
}

export interface FileStore {
  inspect(publicId: string): Promise<StoredFile | null>;
  remove(publicId: string): Promise<boolean>;
  put(input: { bytes: Uint8Array; format: string; contentType: string; folder: string }): Promise<StoredFile & { publicId: string }>;
}

/** Object keys this app writes: <folder>/<yyyy>/<mm>/<24 hex>.<ext> (media-kit newObjectKey). */
const OBJECT_KEY = /^((?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+)\/\d{4}\/\d{2}\/[a-f0-9]{24}\.([a-z0-9]{1,10})$/;

export function fileStore(account: StorageAccount): FileStore {
  if (isBucket(account)) {
    return {
      async inspect(key) {
        const parts = OBJECT_KEY.exec(key);
        if (!parts) return null;
        const head = await headObject(account, key);
        if (!head) return null;
        return { url: objectPublicUrl(account, key), format: parts[2], width: null, height: null, bytes: head.bytes, folder: parts[1] };
      },
      remove: (key) => deleteObject(account, key),
      async put({ bytes, format, contentType, folder }) {
        const key = newObjectKey(folder, format);
        const stored = await putObject(account, key, bytes, contentType);
        return { publicId: key, url: stored.url, format, width: null, height: null, bytes: stored.bytes, folder };
      },
    };
  }

  const client = cloudinaryFor(account);
  return {
    async inspect(publicId) {
      const asset = await client.getAsset(publicId);
      return asset ? { url: asset.secure_url, format: asset.format, width: asset.width ?? null, height: asset.height ?? null, bytes: asset.bytes, folder: asset.folder } : null;
    },
    remove: (publicId) => client.deleteAsset(publicId),
    async put({ bytes, contentType, folder }) {
      const uploaded = await client.uploadBase64({ dataUri: `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`, folder });
      // The client reports no reason, so this moves on without marking the account full.
      if (!uploaded) throw new StorageError("unavailable", `upload to ${account.id} failed`, { accountId: account.id });
      return {
        publicId: uploaded.public_id,
        url: uploaded.secure_url,
        format: uploaded.format,
        width: uploaded.width ?? null,
        height: uploaded.height ?? null,
        bytes: uploaded.bytes || bytes.byteLength,
        folder,
      };
    },
  };
}
