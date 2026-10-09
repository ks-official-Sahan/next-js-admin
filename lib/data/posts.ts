export type PostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

export interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  /** Editor HTML as saved by TipTap. */
  content: string;
  /** Sanitized copy that the public site renders. */
  contentHtml: string;
  /** Plain text for search and read time. */
  contentText: string;
  topic: string;
  tags: string[];
  status: PostStatus;
  publishAt: Date | null;
  publishedAt: Date | null;
  coverMediaId: string | null;
  coverAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  readMinutes: number;
  generatedByAI: boolean;
  noindex: boolean;
  authorId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type OptionalColumn =
  | "excerpt"
  | "coverMediaId"
  | "coverAlt"
  | "seoTitle"
  | "seoDescription"
  | "canonicalUrl"
  | "noindex"
  | "publishAt"
  | "authorId";

export type NewPost = Omit<PostRow, "id" | "createdAt" | "updatedAt" | OptionalColumn> & Partial<Pick<PostRow, OptionalColumn>>;

/** Columns a later write may change. */
export type PostChanges = Partial<Omit<PostRow, "id" | "createdAt" | "updatedAt" | "authorId" | "generatedByAI">>;

/** A public list entry: no body, with the cover and author joined. */
export interface PublishedPostSummaryRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  /** Only read to derive a missing excerpt. */
  contentText: string;
  topic: string;
  tags: string[];
  publishedAt: Date | null;
  updatedAt: Date;
  readMinutes: number;
  coverMedia: { url: string; width: number | null; height: number | null } | null;
  coverAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  author: { name: string | null } | null;
}

export interface PublishedPostRow extends PublishedPostSummaryRow {
  contentHtml: string;
}

export interface AdminPostListRow {
  id: string;
  slug: string;
  title: string;
  topic: string;
  status: PostStatus;
  publishAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
}

export interface PostRepo {
  /**
   * Published posts, newest first, without bodies. Status is the only
   * visibility gate: a SCHEDULED post stays hidden until something promotes
   * it, never because its publishAt has passed.
   */
  listPublished(): Promise<PublishedPostSummaryRow[]>;
  /** One published post with its body. */
  findPublished(slug: string): Promise<PublishedPostRow | null>;
  find(id: string): Promise<PostRow | null>;
  findWithCoverUrl(id: string): Promise<(PostRow & { coverMedia: { url: string } | null }) | null>;
  findMany(ids: string[]): Promise<PostRow[]>;
  /** Id of the post that uses `slug`, or null. */
  idBySlug(slug: string): Promise<string | null>;
  slugsStartingWith(prefix: string): Promise<string[]>;
  /** Distinct topics, A to Z. */
  topics(): Promise<string[]>;
  /** Tag lists of up to `limit` posts, optionally leaving one out. */
  tagLists(limit: number, excludeId?: string): Promise<string[][]>;
  /** One admin list page, most recently edited first. `q` matches the title, ignoring case. */
  adminPage(input: { q?: string; status?: PostStatus; skip: number; take: number }): Promise<{ rows: AdminPostListRow[]; total: number }>;
  count(): Promise<number>;
  /** Throws UniqueViolation when the slug is taken. */
  create(input: NewPost): Promise<PostRow>;
  createMany(input: NewPost[]): Promise<void>;
  /**
   * Writes `changes` only if the post still has `expectedUpdatedAt`; null when
   * someone else changed it or it is gone. Throws UniqueViolation on a taken slug.
   */
  updateIfUnchanged(id: string, expectedUpdatedAt: Date, changes: PostChanges): Promise<PostRow | null>;
  update(id: string, changes: PostChanges): Promise<PostRow>;
  updateMany(ids: string[], changes: PostChanges): Promise<void>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
}

export interface PostRevisionListRow {
  id: string;
  title: string;
  reason: string;
  createdAt: Date;
  authorEmail: string | null;
}

export interface PostRevisionRepo {
  /** A post's revisions, newest first, without their snapshots. */
  listForPost(postId: string, limit: number): Promise<PostRevisionListRow[]>;
  /** A revision's snapshot, only when it belongs to `postId`. */
  findData(id: string, postId: string): Promise<{ data: unknown } | null>;
  create(input: { postId: string; title: string; data: unknown; reason: string; createdById: string | null }): Promise<void>;
}
