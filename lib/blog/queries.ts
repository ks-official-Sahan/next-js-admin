import "server-only";

import { cached } from "@/lib/cache/cached";
import { loadOrNull } from "@/lib/cache/fallback";
import { isValidPostSlug, TAGS } from "@/lib/cache/tags";
import { repos } from "@/lib/data";
import { extractText, sanitizeRich } from "@/lib/cms/rich-text";
import { log } from "@/lib/log";
import { EXCERPT_CHARS } from "@/lib/blog/excerpt";
import { isDue, visibleAhead } from "@/lib/blog/visibility";
import { UpdatesContent } from "@/contents/updates";

import { computeReadMinutes } from "@sahan-sac/blog-kit/readtime";
import { ensureUniqueSlug, slugify } from "@sahan-sac/blog-kit/slug";

// Public reads of blog posts (design notes, Step 12, tag
// `blog:list` / `blog:post:<slug>`). A post is public when it is PUBLISHED,
// or SCHEDULED and its publishAt has passed, so a delayed promotion cron
// (lib/cron/jobs.ts's blogPublishJob) never holds a post back; the cron still
// normalizes the status and runs the durable cache invalidation.
//
// Every read is bounded, so none grows with the number of posts or the size
// of their bodies:
// - lists are keyset pages of summaries (no HTML, no full text); only the
//   first page of each size is cached, see getPostPage();
// - one post's body is read and cached per slug, and `contentHtml` is re-run
//   through sanitizeRich() before it leaves this file, so a row written
//   before the allowlist tightened, or edited directly in the database, is
//   never trusted as-is.
//
// Code defaults (contents/updates.ts) stand in only while the Post table has
// no rows at all, or the database is not configured / unreadable during
// `next build`. Once any post exists, even a draft, an empty public result
// stays empty instead of resurrecting the placeholders.

export interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  topic: string;
  tags: string[];
  date: string;
  publishedAt: string | null;
  /** Last edit, for dateModified/lastModified. Null for the built-in defaults. */
  updatedAt: string | null;
  readMinutes: number;
  coverUrl?: string;
  coverAlt?: string;
  coverWidth?: number;
  coverHeight?: number;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  authorName?: string;
  /** Published but kept out of search engines, the sitemap, RSS and llms.txt. */
  noindex?: boolean;
}

export interface BlogPostView extends BlogPostSummary {
  contentHtml: string;
  contentText: string;
}


const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);

/** `UpdatesContent.posts` adapted to the public shape, used only while the Post table has no rows. */
export function defaultPosts(): BlogPostView[] {
  const taken = new Set<string>();
  return UpdatesContent.posts.map((post) => {
    const slug = ensureUniqueSlug(slugify(post.title) || post.id, taken);
    taken.add(slug);
    const html = sanitizeRich(`<p>${escapeHtml(post.content)}</p>`);
    return {
      id: post.id,
      slug,
      title: post.title,
      excerpt: post.content.slice(0, EXCERPT_CHARS),
      contentHtml: html,
      contentText: post.content,
      topic: post.topic,
      tags: post.tags,
      date: post.date,
      publishedAt: null,
      updatedAt: null,
      readMinutes: computeReadMinutes(post.content),
    };
  });
}

interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  autoExcerpt: string;
  topic: string;
  tags: string[];
  publishAt: Date | string | null;
  publishedAt: Date | string | null;
  updatedAt: Date | string;
  readMinutes: number;
  coverMedia: { url: string; width: number | null; height: number | null } | null;
  coverAlt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  author: { name: string | null } | null;
}

interface FullPostRow extends PostRow {
  contentHtml: string;
}

// Dates are coerced, not trusted as Date instances: a cache hit off the Redis
// read-through in lib/cache/cached.ts round-trips through JSON, which turns
// Date into an ISO string. new Date() on an already-Date value is a no-op.
function toSummary(row: PostRow): BlogPostSummary {
  const effectiveDate = row.publishAt ?? row.publishedAt;
  const publishedAt = effectiveDate ? new Date(effectiveDate) : null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || row.autoExcerpt,
    topic: row.topic,
    tags: row.tags,
    date: publishedAt ? formatDate(publishedAt) : "",
    publishedAt: publishedAt ? publishedAt.toISOString() : null,
    updatedAt: new Date(row.updatedAt).toISOString(),
    readMinutes: row.readMinutes,
    coverUrl: row.coverMedia?.url,
    coverAlt: row.coverAlt || undefined,
    coverWidth: row.coverMedia?.width ?? undefined,
    coverHeight: row.coverMedia?.height ?? undefined,
    seoTitle: row.seoTitle || undefined,
    seoDescription: row.seoDescription || undefined,
    canonicalUrl: row.canonicalUrl || undefined,
    authorName: row.author?.name || undefined,
    noindex: row.noindex || undefined,
  };
}

function toView(row: FullPostRow): BlogPostView {
  return {
    ...toSummary(row),
    // Re-sanitized: never trust a stored value, even one this loader wrote itself.
    contentHtml: sanitizeRich(row.contentHtml),
    contentText: extractText(row.contentHtml),
  };
}

// The cached reads below look VISIBLE_AHEAD_MS ahead, and their `select`
// drops rows not yet due on every cache fill (lib/blog/visibility.ts), so a
// Redis copy filled before a post was due still shows it once it is.
function cachedPost(slug: string) {
  return cached((): Promise<FullPostRow | null> => repos.posts.findPublished(slug, visibleAhead()), ["blog", "post", slug, "v2"], {
    tags: [TAGS.blogPost(slug)],
    revalidate: 300,
    select: (row) => (row && isDue(row) ? row : null),
  });
}

// Every public slug in one small cached read: a detail lookup for an unknown
// slug is answered from it, so crawlers probing random /updates/<slug> or
// /api/content/v1/posts/<slug> URLs never reach the database or create a
// cache entry per guess.
const cachedPublicSlugs = cached(() => repos.posts.listPublicSlugs(visibleAhead()), ["blog", "public-slugs", "v2"], {
  tags: [TAGS.blogList],
  revalidate: 300,
  select: (rows) => rows.filter((row) => isDue(row)),
});

// Rows of any status. Drafts never touch the blog:list tag, so the first
// draft in an empty table shows up here within the 300 s revalidate window.
const cachedPostRowCount = cached(() => repos.posts.count(), ["blog", "row-count", "v1"], {
  tags: [TAGS.blogList],
  revalidate: 300,
});

/** True once the Post table has any row; false when it is empty, or unreadable at build time. */
async function storedPostsExist(): Promise<boolean> {
  const count = await loadOrNull(cachedPostRowCount, {
    onError: (error) => log.warn("blog row count failed during build, using defaults", { error: String(error) }),
  });
  return count !== null && count > 0;
}

function defaultSummaries(limit: number): BlogPostSummary[] {
  return defaultPosts()
    .slice(0, limit)
    .map(({ contentHtml: _html, contentText: _text, ...post }) => post);
}

export interface PublicPostCursor {
  publishedAt: string;
  id: string;
}

export interface PublicPostPage {
  items: BlogPostSummary[];
  nextCursor: PublicPostCursor | null;
}

export function encodePublicPostCursor(cursor: PublicPostCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/** undefined means no cursor; null means malformed. */
export function decodePublicPostCursor(value: string | null): PublicPostCursor | undefined | null {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { id?: unknown; publishedAt?: unknown };
    if (typeof parsed.id !== "string" || !/^[\w-]{1,96}$/.test(parsed.id) || typeof parsed.publishedAt !== "string") return null;
    const date = new Date(parsed.publishedAt);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== parsed.publishedAt) return null;
    return { id: parsed.id, publishedAt: parsed.publishedAt };
  } catch {
    return null;
  }
}

/** A public cursor as the repository's keyset bound; undefined when absent or unparsable. */
function dbCursor(after: PublicPostCursor | undefined): { publishedAt: Date; id: string } | undefined {
  const date = after ? new Date(after.publishedAt) : undefined;
  return after && date && Number.isFinite(date.getTime()) ? { publishedAt: date, id: after.id } : undefined;
}

/** The keyset cursor that continues after `row` (its effective publish time, then id). */
function cursorAfter(row: { id: string; publishAt: Date | string | null; publishedAt: Date | string | null }): PublicPostCursor | null {
  const effectiveDate = row.publishAt ?? row.publishedAt;
  return effectiveDate ? { publishedAt: new Date(effectiveDate).toISOString(), id: row.id } : null;
}

/**
 * Bounded keyset page for the archive, feeds, sitemap and headless API.
 *
 * Only first pages are cached (one entry per page size, and sizes are capped
 * by `maxLimit`). A cursor page reads the database directly: caching it would
 * give every well-formed cursor a client sends its own data-cache and Redis
 * entry. Cursor pages are deep-archive reads, served behind the CDN's
 * s-maxage and the content API's rate limit.
 */
async function getPostPage(
  limit: number,
  after: PublicPostCursor | undefined,
  indexableOnly: boolean,
  maxLimit: number
): Promise<PublicPostPage> {
  const safeLimit = Math.max(1, Math.min(maxLimit, Math.trunc(limit)));
  const cursor = dbCursor(after);
  const read = cursor
    ? async () => (await repos.posts.listPublishedPage(safeLimit + 1, cursor, indexableOnly)).filter((row) => isDue(row))
    : cached(
        // Two reads at one instant: the page as it is now, and the posts that
        // become due within VISIBLE_AHEAD_MS (soonest first, so a crowd of
        // them never pushes due posts off the page). Disjoint by
        // construction; reversed, the upcoming ones are newest first and
        // newer than every due row, so they lead the page once due.
        async () => {
          const now = new Date();
          const [due, upcoming] = await Promise.all([
            repos.posts.listPublishedPage(safeLimit + 1, undefined, indexableOnly, now),
            repos.posts.listUpcoming(now, visibleAhead(now.getTime()), safeLimit + 1, indexableOnly),
          ]);
          return [...upcoming.reverse(), ...due];
        },
        ["blog", "page", indexableOnly ? "indexable" : "all", String(safeLimit), "v2"],
        { tags: [TAGS.blogList], revalidate: 300, select: (rows) => rows.filter((row) => isDue(row)) }
      );
  const rows = await loadOrNull(read, {
    onError: (error) => log.warn("blog page read failed during build, using defaults", { error: String(error) }),
  });
  if (rows && rows.length === 0 && !cursor && (await storedPostsExist())) return { items: [], nextCursor: null };
  if (!rows || rows.length === 0) {
    return { items: cursor ? [] : defaultSummaries(safeLimit), nextCursor: null };
  }

  const hasMore = rows.length > safeLimit;
  const page = rows.slice(0, safeLimit);
  const last = page.at(-1);
  return {
    items: page.map(toSummary),
    nextCursor: hasMore && last ? cursorAfter(last) : null,
  };
}

/** Bounded public page for the archive and headless API. */
export function getPublicPostPage(limit: number, after?: PublicPostCursor): Promise<PublicPostPage> {
  return getPostPage(limit, after, false, 50);
}

/** Bounded page of published posts that should be indexed by search engines. */
export function getIndexablePostPage(limit: number, after?: PublicPostCursor): Promise<PublicPostPage> {
  return getPostPage(limit, after, true, 1_000);
}

/** Indexable posts per sitemap file, well below the protocol's 50,000 URL limit. */
export const SITEMAP_PAGE_SIZE = 1_000;

// The cursor that starts each sitemap file after the first. One cached list,
// invalidated with blog:list, so the sitemap index and every sitemap file
// agree on the same boundaries, and a sitemap file can reject an id that is
// not one of them without a database read.
const cachedSitemapCursors = cached(
  async (): Promise<PublicPostCursor[]> => {
    const cursors: PublicPostCursor[] = [];
    let after: { publishedAt: Date; id: string } | undefined;
    for (;;) {
      const rows = await repos.posts.listIndexableRefs(SITEMAP_PAGE_SIZE + 1, after);
      const last = rows.length > SITEMAP_PAGE_SIZE ? rows[SITEMAP_PAGE_SIZE - 1] : undefined;
      const next = last ? cursorAfter(last) : null;
      if (!next) return cursors;
      cursors.push(next);
      after = { publishedAt: new Date(next.publishedAt), id: next.id };
    }
  },
  ["blog", "sitemap-cursors", "v1"],
  { tags: [TAGS.blogList], revalidate: 300 }
);

/** Start cursors of the second and later sitemap files; empty when one file holds everything. */
export async function getSitemapCursors(): Promise<PublicPostCursor[]> {
  const cursors = await loadOrNull(cachedSitemapCursors, {
    onError: (error) => log.warn("sitemap cursor read failed during build, using one file", { error: String(error) }),
  });
  return cursors ?? [];
}

/** One post as a sitemap or URL list needs it. */
export interface PostRef {
  slug: string;
  /** Effective publish time (publishAt, else publishedAt), ISO; null for code defaults. */
  publishedAt: string | null;
  updatedAt: string | null;
}

const toIso = (value: Date | string | null): string | null => (value ? new Date(value).toISOString() : null);

/**
 * One sitemap file's posts: SITEMAP_PAGE_SIZE indexable posts after `after`,
 * reference fields only. The full summary select carries each post's whole
 * text (for excerpts); at 1,000 rows that can pass the data cache's 2 MB
 * entry limit, and a cache write that fails turns every read into a miss.
 * Only the first file's read is cached, like getPostPage().
 */
export async function getSitemapPostRefs(after?: PublicPostCursor): Promise<PostRef[]> {
  const cursor = dbCursor(after);
  const readRows = () => repos.posts.listIndexableRefs(SITEMAP_PAGE_SIZE, cursor);
  const read = cursor ? readRows : cached(readRows, ["blog", "sitemap-first", "v1"], { tags: [TAGS.blogList], revalidate: 300 });
  const rows = await loadOrNull(read, {
    onError: (error) => log.warn("sitemap post read failed during build, using defaults", { error: String(error) }),
  });
  if (rows && rows.length === 0 && !cursor && (await storedPostsExist())) return [];
  if (!rows || rows.length === 0) {
    return cursor ? [] : defaultPosts().map((post) => ({ slug: post.slug, publishedAt: null, updatedAt: null }));
  }
  return rows.map((row) => ({ slug: row.slug, publishedAt: toIso(row.publishAt ?? row.publishedAt), updatedAt: toIso(row.updatedAt) }));
}

/** A slug isValidPostSlug() rejects, so its page is a 404 without a lookup. */
const NO_POST_SLUG = "_";

/**
 * generateStaticParams for /updates/[slug]: the newest 50 public posts. Never
 * empty: Cache Components fails the build on an empty list, so a database
 * with only drafts gets one placeholder whose page is a 404.
 */
export async function postStaticParams(): Promise<{ slug: string }[]> {
  const posts = await getRecentPosts(50);
  return posts.length > 0 ? posts.map((post) => ({ slug: post.slug })) : [{ slug: NO_POST_SLUG }];
}

/** Up to 50 newest public posts in one cached read: article recommendations, previews, chat context. */
export async function getRecentPosts(limit = 20): Promise<BlogPostSummary[]> {
  return (await getPublicPostPage(limit)).items;
}

/** Up to 1,000 newest indexable posts in one cached read: RSS and llms.txt. */
export async function getRecentIndexablePosts(limit = 20): Promise<BlogPostSummary[]> {
  return (await getIndexablePostPage(limit)).items;
}

/**
 * Every indexable post's URL fields, up to `max` (IndexNow's whole-site
 * submit takes at most 10,000 URLs): one reference-only read per sitemap
 * file, using the cached sitemap boundaries, so at most ten bounded reads.
 */
export async function getAllIndexablePosts(max = 10_000): Promise<PostRef[]> {
  const items = await getSitemapPostRefs();
  for (const cursor of await getSitemapCursors()) {
    if (items.length >= max) break;
    items.push(...(await getSitemapPostRefs(cursor)));
  }
  return items.slice(0, max);
}

/**
 * One published post with its body, or null. Unknown slugs are answered from
 * the cached public slug list (no per-guess cache entry); the code defaults
 * answer only while the Post table has no rows at all, or the database is
 * not configured / unreadable at build time.
 */
export async function getPostBySlug(slug: string, defaults?: BlogPostView[]): Promise<BlogPostView | null> {
  if (!isValidPostSlug(slug)) return null;
  const slugs = await loadOrNull(cachedPublicSlugs, {
    onError: (error) => log.warn("blog slug list read failed", { error: String(error) }),
  });
  if (!slugs || (slugs.length === 0 && !(await storedPostsExist()))) {
    return (defaults ?? defaultPosts()).find((post) => post.slug === slug) ?? null;
  }
  if (!slugs.some((entry) => entry.slug === slug)) return null;

  const row = await loadOrNull(cachedPost(slug), {
    onError: (error) => log.warn("blog post read failed", { slug, error: String(error) }),
  });
  return row ? toView(row) : null;
}

// Old slugs left by renames (post_slug_redirects), with their posts' current
// slugs. One small cached read, invalidated with blog:list like every list.
const cachedSlugRedirects = cached(() => repos.posts.listSlugRedirects(), ["blog", "slug-redirects", "v1"], {
  tags: [TAGS.blogList],
  revalidate: 300,
});

/**
 * The current slug for an old one, when that post is public now; else null.
 * The post page and the content API answer an old slug with a permanent
 * redirect instead of a 404, so links and search results keep working.
 */
export async function getPostRedirect(slug: string): Promise<string | null> {
  if (!isValidPostSlug(slug)) return null;
  const redirects = await loadOrNull(cachedSlugRedirects, {
    onError: (error) => log.warn("blog slug redirect read failed", { error: String(error) }),
  });
  const target = redirects?.find((entry) => entry.slug === slug)?.targetSlug;
  if (!target || target === slug) return null;
  return (await getPostBySlug(target)) ? target : null;
}

/**
 * Any post by id with its body, whatever its status, for the signed preview
 * page. Never cached: it shows drafts, and each read is behind a token check.
 */
export async function getPostPreview(id: string): Promise<BlogPostView | null> {
  const row = await repos.posts.findForPreview(id);
  return row ? toView(row) : null;
}

/** Up to `limit` other posts sharing the most tags/topic with `post`, newest first on ties. */
export function relatedPosts(post: BlogPostSummary, posts: BlogPostSummary[], limit = 3): BlogPostSummary[] {
  const tags = new Set(post.tags);
  return posts
    .filter((candidate) => candidate.slug !== post.slug)
    .map((candidate, index) => ({
      candidate,
      index,
      score: candidate.tags.filter((tag) => tags.has(tag)).length + (candidate.topic === post.topic ? 1 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export interface TaxonomyEntry {
  name: string;
  count: number;
}

/** Topics and tags computed from the posts actually shown, so a filter never advertises something absent. */
export function taxonomyOf(posts: BlogPostSummary[]): { topics: TaxonomyEntry[]; tags: TaxonomyEntry[] } {
  const topicCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const post of posts) {
    topicCounts.set(post.topic, (topicCounts.get(post.topic) ?? 0) + 1);
    for (const tag of post.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  return {
    topics: [...topicCounts.entries()].map(([name, count]) => ({ name, count })),
    tags: [...tagCounts.entries()].map(([name, count]) => ({ name, count })),
  };
}
