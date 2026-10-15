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
  /** The start of contentText, for lists (lib/blog/excerpt.ts). */
  autoExcerpt: string;
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
  | "autoExcerpt"
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
  /** Shown when there is no hand-written excerpt. */
  autoExcerpt: string;
  topic: string;
  tags: string[];
  /** Scheduled publication time; used as the effective publish date before cron promotion. */
  publishAt: Date | null;
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

/** The fields a sitemap or URL list needs: no text, so 1,000 rows stay small. */
export interface PublishedPostRefRow {
  id: string;
  slug: string;
  publishAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
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
   * Bounded keyset page of public posts without bodies, newest first by
   * effective publish time. A scheduled post becomes visible at publishAt
   * even if the promotion cron is delayed. `visibleAt` (default now) is the
   * instant visibility is judged at; a later one also returns posts that
   * become due before it, for a cache that filters them when served.
   */
  listPublishedPage(
    take: number,
    after?: { publishedAt: Date; id: string },
    indexableOnly?: boolean,
    visibleAt?: Date
  ): Promise<PublishedPostSummaryRow[]>;
  /** The same keyset page of indexable posts as listPublishedPage, with reference fields only. */
  listIndexableRefs(take: number, after?: { publishedAt: Date; id: string }): Promise<PublishedPostRefRow[]>;
  /**
   * Posts that become public after `from` and by `to` (a scheduled or
   * published post whose publishAt falls in that window), soonest first:
   * what a cached first page adds so a post appears at its publishAt.
   */
  listUpcoming(from: Date, to: Date, take: number, indexableOnly?: boolean): Promise<PublishedPostSummaryRow[]>;
  /** Every post visible to the public at `visibleAt` (default now; same rule as findPublished), with its publishAt. */
  listPublicSlugs(visibleAt?: Date): Promise<Array<{ slug: string; publishAt: Date | null }>>;
  /** One post visible to the public at `visibleAt` (default now), with its body. */
  findPublished(slug: string, visibleAt?: Date): Promise<PublishedPostRow | null>;
  /** Old slugs that redirect, each with the current slug of its post. */
  listSlugRedirects(): Promise<Array<{ slug: string; targetSlug: string }>>;
  /**
   * After a rename from `oldSlug` to `newSlug`: `oldSlug` redirects to the
   * post, and any redirect that used `newSlug` is dropped (the slug is a real
   * post again). A no-op when the slug did not change.
   */
  recordRename(postId: string, oldSlug: string, newSlug: string): Promise<void>;
  /** Drops a redirect that used `slug`, for a new post that takes it. */
  releaseSlug(slug: string): Promise<void>;
  find(id: string): Promise<PostRow | null>;
  findWithCoverUrl(id: string): Promise<(PostRow & { coverMedia: { url: string } | null }) | null>;
  /** Any post by id, whatever its status, shaped like findPublished: for a signed preview. */
  findForPreview(id: string): Promise<PublishedPostRow | null>;
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
  /** Rows of any status. */
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
