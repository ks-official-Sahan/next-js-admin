import { and, asc, desc, eq, gt, ilike, inArray, isNotNull, isNull, like, lt, lte, ne, or, type SQL } from "drizzle-orm";

import { mediaAssets, postRevisions, postSlugRedirects, posts, users } from "@/lib/db/schema";

import type { PostRepo, PostRevisionRepo, PostRow } from "../posts";
import { containsPattern, countRows, first, one, prefixPattern, type DbClient } from "./client";
import { translateUnique } from "./errors";

type Cursor = { publishedAt: Date; id: string };

const SUMMARY_COLUMNS = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  excerpt: posts.excerpt,
  autoExcerpt: posts.autoExcerpt,
  topic: posts.topic,
  tags: posts.tags,
  publishAt: posts.publishAt,
  publishedAt: posts.publishedAt,
  updatedAt: posts.updatedAt,
  readMinutes: posts.readMinutes,
  coverMedia: { url: mediaAssets.url, width: mediaAssets.width, height: mediaAssets.height },
  coverAlt: posts.coverAlt,
  seoTitle: posts.seoTitle,
  seoDescription: posts.seoDescription,
  canonicalUrl: posts.canonicalUrl,
  noindex: posts.noindex,
  author: { id: users.id, name: users.name },
};

const REF_COLUMNS = {
  id: posts.id,
  slug: posts.slug,
  publishAt: posts.publishAt,
  publishedAt: posts.publishedAt,
  updatedAt: posts.updatedAt,
};

type JoinedSummary = {
  tags: string[] | null;
  coverMedia: { url: string | null; width: number | null; height: number | null } | null;
  author: { id: string | null; name: string | null } | null;
};

/** Shapes a joined row like the Prisma reference: null when there is no cover or author. */
function toSummary<T extends JoinedSummary>(row: T) {
  const { coverMedia, author, ...rest } = row;
  return {
    ...rest,
    tags: row.tags ?? [],
    coverMedia: coverMedia && coverMedia.url !== null ? { url: coverMedia.url, width: coverMedia.width, height: coverMedia.height } : null,
    author: author && author.id !== null ? { name: author.name } : null,
  };
}

const asRow = <T extends { tags: string[] | null }>(row: T) => ({ ...row, tags: row.tags ?? [] }) as T & { tags: string[] };

const effectivePublishedAt = (row: { publishedAt: Date | null; publishAt: Date | null }): Date => row.publishAt ?? row.publishedAt ?? new Date(0);

function newestFirst<T extends { id: string; publishedAt: Date | null; publishAt: Date | null }>(rows: T[]): T[] {
  return rows.sort((a, b) => effectivePublishedAt(b).getTime() - effectivePublishedAt(a).getTime() || b.id.localeCompare(a.id));
}

/** Keyset continuation after `cursor` on the given sort column (same tie-break on id as the sort). */
function afterCursor(column: typeof posts.publishAt, cursor?: Cursor): SQL | undefined {
  if (!cursor) return undefined;
  return or(lt(column, cursor.publishedAt), and(eq(column, cursor.publishedAt), lt(posts.id, cursor.id)));
}

/**
 * The three public branches, each with its own cursor and sort, mirroring the
 * Prisma reference: published posts without publishAt sort by publishedAt; a
 * promoted or due scheduled post sorts by publishAt. Each branch is cut to
 * `take` before the JS merge.
 */
function publicBranches(now: Date, after: Cursor | undefined, indexableOnly: boolean): Array<{ where: SQL | undefined; sortBy: "publishedAt" | "publishAt" }> {
  const indexable = indexableOnly ? eq(posts.noindex, false) : undefined;
  return [
    {
      where: and(eq(posts.status, "PUBLISHED"), isNull(posts.publishAt), indexable, afterCursor(posts.publishedAt, after)),
      sortBy: "publishedAt",
    },
    {
      where: and(
        eq(posts.status, "PUBLISHED"),
        isNotNull(posts.publishAt),
        lte(posts.publishAt, now),
        indexable,
        afterCursor(posts.publishAt, after)
      ),
      sortBy: "publishAt",
    },
    {
      where: and(eq(posts.status, "SCHEDULED"), lte(posts.publishAt, now), indexable, afterCursor(posts.publishAt, after)),
      sortBy: "publishAt",
    },
  ];
}

/** Visible to the public at `now`: published (and its publishAt, if any, has passed) or scheduled and due. */
function publicNow(now: Date): SQL | undefined {
  return or(
    and(eq(posts.status, "PUBLISHED"), or(isNull(posts.publishAt), lte(posts.publishAt, now))),
    and(eq(posts.status, "SCHEDULED"), lte(posts.publishAt, now))
  );
}

export function postRepo(client: DbClient): PostRepo {
  const byId = async (id: string) => first(await client.select().from(posts).where(eq(posts.id, id)).limit(1));
  return {
    async listPublishedPage(take, after, indexableOnly = false, visibleAt) {
      const now = visibleAt ?? new Date();
      const pages = await Promise.all(
        publicBranches(now, after, indexableOnly).map(({ where, sortBy }) =>
          client
            .select(SUMMARY_COLUMNS)
            .from(posts)
            .leftJoin(mediaAssets, eq(mediaAssets.id, posts.coverMediaId))
            .leftJoin(users, eq(users.id, posts.authorId))
            .where(where)
            .orderBy(desc(posts[sortBy]), desc(posts.id))
            .limit(take)
        )
      );
      return newestFirst(pages.flat().map((row) => toSummary(row))).slice(0, take);
    },
    async listIndexableRefs(take, after) {
      const pages = await Promise.all(
        publicBranches(new Date(), after, true).map(({ where, sortBy }) =>
          client.select(REF_COLUMNS).from(posts).where(where).orderBy(desc(posts[sortBy]), desc(posts.id)).limit(take)
        )
      );
      return newestFirst(pages.flat()).slice(0, take);
    },
    async listUpcoming(from, to, take, indexableOnly) {
      const rows = await client
        .select(SUMMARY_COLUMNS)
        .from(posts)
        .leftJoin(mediaAssets, eq(mediaAssets.id, posts.coverMediaId))
        .leftJoin(users, eq(users.id, posts.authorId))
        .where(
          and(
            inArray(posts.status, ["PUBLISHED", "SCHEDULED"]),
            gt(posts.publishAt, from),
            lte(posts.publishAt, to),
            indexableOnly ? eq(posts.noindex, false) : undefined
          )
        )
        .orderBy(asc(posts.publishAt), asc(posts.id))
        .limit(take);
      return rows.map((row) => toSummary(row));
    },
    async listPublicSlugs(visibleAt) {
      return client
        .select({ slug: posts.slug, publishAt: posts.publishAt })
        .from(posts)
        .where(publicNow(visibleAt ?? new Date()));
    },
    async findPublished(slug, visibleAt) {
      const row = first(
        await client
          .select({ ...SUMMARY_COLUMNS, contentHtml: posts.contentHtml })
          .from(posts)
          .leftJoin(mediaAssets, eq(mediaAssets.id, posts.coverMediaId))
          .leftJoin(users, eq(users.id, posts.authorId))
          .where(and(eq(posts.slug, slug), publicNow(visibleAt ?? new Date())))
          .limit(1)
      );
      return row && toSummary(row);
    },
    async listSlugRedirects() {
      return client
        .select({ slug: postSlugRedirects.slug, targetSlug: posts.slug })
        .from(postSlugRedirects)
        .innerJoin(posts, eq(posts.id, postSlugRedirects.postId));
    },
    async recordRename(postId, oldSlug, newSlug) {
      if (oldSlug === newSlug) return;
      await client.delete(postSlugRedirects).where(eq(postSlugRedirects.slug, newSlug));
      await client
        .insert(postSlugRedirects)
        .values({ slug: oldSlug, postId })
        .onConflictDoUpdate({ target: postSlugRedirects.slug, set: { postId } });
    },
    async releaseSlug(slug) {
      await client.delete(postSlugRedirects).where(eq(postSlugRedirects.slug, slug));
    },
    async findForPreview(id) {
      const row = first(
        await client
          .select({ ...SUMMARY_COLUMNS, contentHtml: posts.contentHtml })
          .from(posts)
          .leftJoin(mediaAssets, eq(mediaAssets.id, posts.coverMediaId))
          .leftJoin(users, eq(users.id, posts.authorId))
          .where(eq(posts.id, id))
          .limit(1)
      );
      return row && toSummary(row);
    },
    async find(id) {
      const row = await byId(id);
      return row && (asRow(row) as PostRow);
    },
    async findWithCoverUrl(id) {
      const row = first(
        await client
          .select({ post: posts, coverUrl: mediaAssets.url })
          .from(posts)
          .leftJoin(mediaAssets, eq(mediaAssets.id, posts.coverMediaId))
          .where(eq(posts.id, id))
          .limit(1)
      );
      return row && { ...(asRow(row.post) as PostRow), coverMedia: row.coverUrl === null ? null : { url: row.coverUrl } };
    },
    async findMany(ids) {
      if (ids.length === 0) return [];
      return (await client.select().from(posts).where(inArray(posts.id, ids))).map((row) => asRow(row) as PostRow);
    },
    async idBySlug(slug) {
      return first(await client.select({ id: posts.id }).from(posts).where(eq(posts.slug, slug)).limit(1))?.id ?? null;
    },
    async slugsStartingWith(prefix) {
      return (await client.select({ slug: posts.slug }).from(posts).where(like(posts.slug, prefixPattern(prefix)))).map((row) => row.slug);
    },
    async topics() {
      return (await client.selectDistinct({ topic: posts.topic }).from(posts).orderBy(asc(posts.topic))).map((row) => row.topic);
    },
    async tagLists(limit, excludeId) {
      const rows = await client
        .select({ tags: posts.tags })
        .from(posts)
        .where(excludeId ? ne(posts.id, excludeId) : undefined)
        .limit(limit);
      return rows.map((row) => row.tags ?? []);
    },
    async adminPage({ q, status, skip, take }) {
      const where = and(q ? ilike(posts.title, containsPattern(q)) : undefined, status ? eq(posts.status, status) : undefined);
      const [rows, total] = await Promise.all([
        client
          .select({
            id: posts.id,
            slug: posts.slug,
            title: posts.title,
            topic: posts.topic,
            status: posts.status,
            publishAt: posts.publishAt,
            publishedAt: posts.publishedAt,
            updatedAt: posts.updatedAt,
          })
          .from(posts)
          .where(where)
          .orderBy(desc(posts.updatedAt))
          .limit(take)
          .offset(skip),
        countRows(client, posts, where),
      ]);
      return { rows, total };
    },
    count() {
      return countRows(client, posts);
    },
    create(input) {
      return translateUnique(async () => asRow(one(await client.insert(posts).values(input).returning(), "Post")) as PostRow);
    },
    async createMany(input) {
      if (input.length === 0) return;
      await client.insert(posts).values(input);
    },
    updateIfUnchanged(id, expectedUpdatedAt, changes) {
      return translateUnique(async () => {
        const row = first(
          await client
            .update(posts)
            .set(changes)
            .where(and(eq(posts.id, id), eq(posts.updatedAt, expectedUpdatedAt)))
            .returning()
        );
        return row && (asRow(row) as PostRow);
      });
    },
    update(id, changes) {
      return translateUnique(async () => asRow(one(await client.update(posts).set(changes).where(eq(posts.id, id)).returning(), "Post")) as PostRow);
    },
    async updateMany(ids, changes) {
      if (ids.length === 0) return;
      await client.update(posts).set(changes).where(inArray(posts.id, ids));
    },
    async delete(id) {
      await client.delete(posts).where(eq(posts.id, id));
    },
    async deleteMany(ids) {
      if (ids.length === 0) return;
      await client.delete(posts).where(inArray(posts.id, ids));
    },
  };
}

export function postRevisionRepo(client: DbClient): PostRevisionRepo {
  return {
    listForPost(postId, limit) {
      return client
        .select({
          id: postRevisions.id,
          title: postRevisions.title,
          reason: postRevisions.reason,
          createdAt: postRevisions.createdAt,
          authorEmail: users.email,
        })
        .from(postRevisions)
        .leftJoin(users, eq(users.id, postRevisions.createdById))
        .where(eq(postRevisions.postId, postId))
        .orderBy(desc(postRevisions.createdAt))
        .limit(limit);
    },
    async findData(id, postId) {
      return first(
        await client
          .select({ data: postRevisions.data })
          .from(postRevisions)
          .where(and(eq(postRevisions.id, id), eq(postRevisions.postId, postId)))
          .limit(1)
      );
    },
    async create(input) {
      await client.insert(postRevisions).values(input);
    },
  };
}
