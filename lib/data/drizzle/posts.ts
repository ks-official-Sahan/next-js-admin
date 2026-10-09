import { and, asc, desc, eq, ilike, inArray, like, ne } from "drizzle-orm";

import { mediaAssets, postRevisions, posts, users } from "@/lib/db/schema";

import type { PostRepo, PostRevisionRepo, PostRow } from "../posts";
import { containsPattern, countRows, first, one, prefixPattern, type DbClient } from "./client";
import { translateUnique } from "./errors";

/** The public visibility rule: status alone, never publishAt. */
export const PUBLISHED = eq(posts.status, "PUBLISHED");

const asRow = <T extends { tags: string[] | null }>(row: T) => ({ ...row, tags: row.tags ?? [] }) as T & { tags: string[] };

const summaryColumns = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  excerpt: posts.excerpt,
  contentText: posts.contentText,
  topic: posts.topic,
  tags: posts.tags,
  publishedAt: posts.publishedAt,
  updatedAt: posts.updatedAt,
  readMinutes: posts.readMinutes,
  coverMedia: { url: mediaAssets.url, width: mediaAssets.width, height: mediaAssets.height },
  coverAlt: posts.coverAlt,
  seoTitle: posts.seoTitle,
  seoDescription: posts.seoDescription,
  canonicalUrl: posts.canonicalUrl,
  noindex: posts.noindex,
  author: { name: users.name },
};

export function postRepo(client: DbClient): PostRepo {
  const byId = async (id: string) => first(await client.select().from(posts).where(eq(posts.id, id)).limit(1));
  return {
    async listPublished() {
      const rows = await client
        .select(summaryColumns)
        .from(posts)
        .leftJoin(mediaAssets, eq(mediaAssets.id, posts.coverMediaId))
        .leftJoin(users, eq(users.id, posts.authorId))
        .where(PUBLISHED)
        .orderBy(desc(posts.publishedAt));
      return rows.map(asRow);
    },
    async findPublished(slug) {
      const row = first(
        await client
          .select({ ...summaryColumns, contentHtml: posts.contentHtml })
          .from(posts)
          .leftJoin(mediaAssets, eq(mediaAssets.id, posts.coverMediaId))
          .leftJoin(users, eq(users.id, posts.authorId))
          .where(and(PUBLISHED, eq(posts.slug, slug)))
          .limit(1)
      );
      return row && asRow(row);
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
