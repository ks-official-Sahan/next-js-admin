import type { BucketAccount } from "@sahan-sac/media-kit/accounts";
import { deleteObject, type FetchFn, getObject, listObjects, putObject } from "@sahan-sac/media-kit/bucket";
import { StorageError } from "@sahan-sac/media-kit/storage";

import { backupIdDate, isBackupId, MANIFEST_FILE, type Manifest, parseManifest } from "./format";

// Backups in the bucket: <prefix>/<id>/<object>. The bucket listing is the
// only index (no database table to drift from it), and a backup is complete
// exactly when its manifest exists.

export interface StoredBackup {
  id: string;
  createdAt: string;
  complete: boolean;
  bytes: number;
  objects: number;
  keys: string[];
}

export const objectKey = (prefix: string, id: string, name: string) => `${prefix}/${id}/${name}`;

/** Every backup under `prefix`, newest first. */
export async function listStoredBackups(account: BucketAccount, prefix: string, fetchFn: FetchFn = fetch): Promise<StoredBackup[]> {
  const byId = new Map<string, StoredBackup>();
  let token: string | undefined;
  do {
    const page = await listObjects(account, { prefix: `${prefix}/`, continuationToken: token }, fetchFn).catch((error: unknown) => {
      if (error instanceof StorageError && error.status === 404) throw new Error(`Bucket "${account.bucket}" does not exist at the endpoint; create it first`);
      throw error;
    });
    for (const object of page.objects) {
      const [id, name] = object.key.slice(prefix.length + 1).split("/");
      const date = isBackupId(id) ? backupIdDate(id) : null;
      if (!date || !name) continue;
      const entry = byId.get(id) ?? { id, createdAt: date.toISOString(), complete: false, bytes: 0, objects: 0, keys: [] };
      entry.bytes += object.bytes;
      entry.objects += 1;
      entry.keys.push(object.key);
      if (name === MANIFEST_FILE) entry.complete = true;
      byId.set(id, entry);
    }
    token = page.nextToken ?? undefined;
  } while (token);
  return [...byId.values()].sort((a, b) => (a.id < b.id ? 1 : -1));
}

export async function readManifest(account: BucketAccount, prefix: string, id: string, fetchFn: FetchFn = fetch): Promise<Manifest | null> {
  if (!isBackupId(id)) return null;
  const body = await getObject(account, objectKey(prefix, id, MANIFEST_FILE), fetchFn);
  if (!body) return null;
  try {
    return parseManifest(JSON.parse(Buffer.from(body).toString("utf8")));
  } catch {
    return null;
  }
}

export async function writeObject(account: BucketAccount, key: string, body: Buffer, contentType: string, fetchFn: FetchFn = fetch): Promise<void> {
  await putObject(account, key, body, contentType, fetchFn);
}

export async function readObject(account: BucketAccount, key: string, fetchFn: FetchFn = fetch): Promise<Buffer | null> {
  const body = await getObject(account, key, fetchFn);
  return body ? Buffer.from(body) : null;
}

/** Deletes every object of the given backups, eight at a time. Returns how many objects went. */
export async function deleteStoredBackups(account: BucketAccount, backups: readonly StoredBackup[], fetchFn: FetchFn = fetch): Promise<number> {
  const keys = backups.flatMap((backup) => backup.keys);
  let deleted = 0;
  for (let index = 0; index < keys.length; index += 8) {
    const results = await Promise.all(keys.slice(index, index + 8).map((key) => deleteObject(account, key, fetchFn)));
    deleted += results.filter(Boolean).length;
  }
  return deleted;
}
