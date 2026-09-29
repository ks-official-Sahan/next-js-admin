import "server-only";

import { cached } from "@/lib/cache/cached";
import { loadOrNull } from "@/lib/cache/fallback";
import { isValidPostSlug, TAGS } from "@/lib/cache/tags";
import { db } from "@/lib/db/prisma";
import { extractText, sanitizeRich } from "@/lib/cms/rich-text";
import { log } from "@/lib/log";
import { UpdatesContent } from "@/contents/updates";

import { computeReadMinutes } from "@sahan-sac/blog-kit/readtime";
import { ensureUniqueSlug, slugify } from "@sahan-sac/blog-kit/slug";

// Public reads of blog posts (design notes, Step 12, tag
// `blog:list` / `blog:post:<slug>`). Only PUBLISHED rows are ever read here:
// a SCHEDULED post becomes visible only once lib/cron/jobs.ts's
// blogPublishJob (or a manual publish) actually promotes its status, never by
// comparing `publishAt` to "now" in this loader.
//
// Two cached reads, so neither grows with the size of every post body:
// - the list holds summaries only (no HTML, no full text), which keeps the
//   cache entry far below the data cache's 2 MB per-entry limit;
// - one post's body is read and cached per slug, and `contentHtml` is re-run
//   through sanitizeRich() before it leaves this file, so a row written
//   before the allowlist tightened, or edited directly in the database, is
//   never trusted as-is.

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

const EXCERPT_CHARS = 200;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);

/** `UpdatesContent.posts` adapted to the public shape, used only while the table is empty. */
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

const SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  // Only read to derive a missing excerpt; never cached with the list.
  contentText: true,
  topic: true,
  tags: true,
  publishedAt: true,
  updatedAt: true,
  readMinutes: true,
  coverMedia: { select: { url: true, width: true, height: true } },
  coverAlt: true,
  seoTitle: true,
  seoDescription: true,
  canonicalUrl: true,
  noindex: true,
  author: { select: { name: true } },
} as const;

interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentText: string;
  topic: string;
  tags: string[];
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
  const publishedAt = row.publishedAt ? new Date(row.publishedAt) : null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || row.contentText.slice(0, EXCERPT_CHARS),
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
    contentText: row.contentText || extractText(row.contentHtml),
  };
}

// Status is the only visibility gate, exported so a test can assert it never
// grows a publishAt comparison. A SCHEDULED post stays hidden until
// lib/cron/jobs.ts's blogPublishJob (or a manual publish) actually promotes
// it to PUBLISHED (design notes, Step 12).
export const PUBLISHED_WHERE = { status: "PUBLISHED" } as const;

type PostListDb = Pick<typeof db.post, "findMany">;
type PostOneDb = Pick<typeof db.post, "findFirst">;

export async function readPublishedPosts(client: PostListDb = db.post): Promise<PostRow[]> {
  return client.findMany({
    where: PUBLISHED_WHERE,
    orderBy: { publishedAt: "desc" },
    select: SUMMARY_SELECT,
  });
}

export async function readPublishedPost(slug: string, client: PostOneDb = db.post): Promise<FullPostRow | null> {
  return client.findFirst({
    where: { ...PUBLISHED_WHERE, slug },
    select: { ...SUMMARY_SELECT, contentHtml: true },
  });
}

const cachedSummaries = cached(async () => (await readPublishedPosts()).map(toSummary), ["blog", "list", "v3"], {
  tags: [TAGS.blogList],
  revalidate: 300,
});

function cachedPost(slug: string) {
  return cached(() => readPublishedPost(slug), ["blog", "post", slug], {
    tags: [TAGS.blogPost(slug), TAGS.blogList],
    revalidate: 300,
  });
}

/** Stored summaries, or null when the table is empty or unreadable (build without a database). */
async function publishedSummaries(): Promise<BlogPostSummary[] | null> {
  const rows = await loadOrNull(cachedSummaries, {
    onError: (error) => log.warn("blog posts read failed during build, using defaults", { error: String(error) }),
  });
  return rows && rows.length > 0 ? rows : null;
}

/**
 * Published posts, newest first, without bodies. Falls back to
 * `UpdatesContent.posts` only when the Post table is empty (not configured, a
 * build-time failure, or genuinely zero rows) — same fallback rule as the
 * works collections.
 */
export async function getPosts(defaults?: BlogPostView[]): Promise<BlogPostSummary[]> {
  return (await publishedSummaries()) ?? defaults ?? defaultPosts();
}

/** Published posts search engines and AI crawlers may see: the sitemap, RSS and llms.txt. */
export async function getIndexablePosts(): Promise<BlogPostSummary[]> {
  return (await getPosts()).filter((post) => !post.noindex);
}

/**
 * One published post with its body, or null. An unknown or malformed slug is
 * answered from the cached list, so a crawler probing random /updates/<slug>
 * URLs never reaches the database or creates a cache entry per guess.
 */
export async function getPostBySlug(slug: string, defaults?: BlogPostView[]): Promise<BlogPostView | null> {
  if (!isValidPostSlug(slug)) return null;
  const summaries = await publishedSummaries();
  if (!summaries) return (defaults ?? defaultPosts()).find((post) => post.slug === slug) ?? null;
  if (!summaries.some((post) => post.slug === slug)) return null;

  const row = await loadOrNull(cachedPost(slug), {
    onError: (error) => log.warn("blog post read failed", { slug, error: String(error) }),
  });
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
