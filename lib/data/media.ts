export type MediaKind = "IMAGE" | "VIDEO" | "DOCUMENT";
export type MediaProvider = "LOCAL" | "CLOUDINARY" | "S3" | "R2";

export interface MediaAssetRow {
  id: string;
  provider: MediaProvider;
  /** Storage account holding the file (MEDIA_ACCOUNT_<n>_ID, or "cloudinary"). */
  accountId: string;
  kind: MediaKind;
  /** Absolute delivery URL (Cloudinary or a bucket's public URL), or a /works/... path for LOCAL assets. */
  url: string;
  publicId: string | null;
  format: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  title: string | null;
  alt: string | null;
  tags: string[];
  folder: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Where an asset is used. */
export interface MediaUsageRow {
  id: string;
  entityType: string;
  entityId: string;
  field: string;
}

export interface MediaPageCursor {
  id: string;
  createdAt: Date;
}

export interface NewMediaAsset {
  provider: MediaProvider;
  /** Defaults to the legacy "cloudinary" account. */
  accountId?: string;
  kind: MediaKind;
  url: string;
  publicId: string | null;
  format: string;
  width?: number | null;
  height?: number | null;
  sizeBytes: number;
  title?: string | null;
  alt?: string | null;
  folder: string;
  createdById?: string | null;
}

export interface MediaRepo {
  find(id: string): Promise<MediaAssetRow | null>;
  findMany(ids: string[]): Promise<MediaAssetRow[]>;
  findWithUsages(id: string): Promise<(MediaAssetRow & { usages: MediaUsageRow[] }) | null>;
  /**
   * Row-locks the asset until the transaction ends (SELECT ... FOR UPDATE).
   * A usage insert needs a key-share lock on the same row for its foreign key,
   * so it waits for the lock holder: a delete that locks first sees every
   * usage committed before it and blocks every usage written after it.
   */
  lockForUpdate(id: string): Promise<void>;
  /** Bounded, newest-first library search. Returns up to `take` rows. */
  listPage(input: { query?: string; kind?: MediaKind; after?: MediaPageCursor; take: number }): Promise<MediaAssetRow[]>;
  /** Newest first. */
  listRecent(limit: number): Promise<MediaAssetRow[]>;
  create(input: NewMediaAsset): Promise<MediaAssetRow>;
  /** Whether a row already owns this file on this account. */
  existsByPublicId(provider: NewMediaAsset["provider"], accountId: string, publicId: string): Promise<boolean>;
  /** Bytes recorded per storage account, in one grouped query. */
  bytesByAccount(): Promise<Record<string, number>>;
  /** Creates the asset unless one with the same provider, account and publicId exists. */
  createIfMissing(input: NewMediaAsset & { publicId: string }): Promise<void>;
  updateMetadata(id: string, input: { alt: string | null; title: string | null; tags: string[] }): Promise<MediaAssetRow>;
  delete(id: string): Promise<void>;
  /** Records one use; recording the same use twice is a no-op. */
  recordUsage(input: { mediaId: string } & Omit<MediaUsageRow, "id">): Promise<void>;
  /** Records several uses in one statement; already recorded ones are skipped. */
  recordUsages(inputs: Array<{ mediaId: string } & Omit<MediaUsageRow, "id">>): Promise<void>;
  /** Forgets every use by one entity, or by several in one statement. */
  clearUsage(entityType: string, entityIds: string | readonly string[]): Promise<void>;
}
