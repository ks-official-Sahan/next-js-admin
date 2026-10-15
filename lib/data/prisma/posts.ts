import type { Prisma } from "@prisma/client";

import type { PostRepo, PostRevisionRepo, PublishedPostRefRow, PublishedPostSummaryRow } from "../posts";
import type { DbClient } from "./client";
import { isNotFound, translateUnique } from "./errors";

const SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  autoExcerpt: true,
  topic: true,
  tags: true,
  publishAt: true,
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

const REF_SELECT = { id: true, slug: true, publishAt: true, publishedAt: true, updatedAt: true } as const;

function publicPostAfter(field: "publishedAt" | "publishAt", cursor?: { publishedAt: Date; id: string }): Prisma.PostWhereInput {
  if (!cursor) return {};
  return {
    OR: [
      { [field]: { lt: cursor.publishedAt } },
      { [field]: cursor.publishedAt, id: { lt: cursor.id } },
    ],
  };
}

function effectivePublishedAt(row: { publishedAt: Date | null; publishAt: Date | null }): Date {
  return row.publishAt ?? row.publishedAt ?? new Date(0);
}

function newestFirst<T extends { id: string; publishedAt: Date | null; publishAt: Date | null }>(rows: T[]): T[] {
  return rows.sort((a, b) => effectivePublishedAt(b).getTime() - effectivePublishedAt(a).getTime() || b.id.localeCompare(a.id));
}

function publicPostQueries<Row = PublishedPostSummaryRow>(
  client: DbClient,
  take: number,
  after?: { publishedAt: Date; id: string },
  indexableOnly = false,
  select: Prisma.PostSelect = SUMMARY_SELECT,
  now = new Date()
): Promise<[Row[], Row[], Row[]]> {
  const publishedWhere: Prisma.PostWhereInput = {
    status: "PUBLISHED",
    publishAt: null,
    ...(indexableOnly ? { noindex: false } : {}),
    AND: [publicPostAfter("publishedAt", after)],
  };
  // The daily promotion job preserves publishAt on a promoted scheduled post,
  // so it retains its intended position when a client pages through the feed.
  const promotedScheduledWhere: Prisma.PostWhereInput = {
    status: "PUBLISHED",
    publishAt: { not: null, lte: now },
    ...(indexableOnly ? { noindex: false } : {}),
    AND: [publicPostAfter("publishAt", after)],
  };
  const scheduledWhere: Prisma.PostWhereInput = {
    status: "SCHEDULED",
    publishAt: { lte: now },
    ...(indexableOnly ? { noindex: false } : {}),
    AND: [publicPostAfter("publishAt", after)],
  };
  const publishedArgs = {
    where: publishedWhere,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    select,
  } as const satisfies Prisma.PostFindManyArgs;
  const scheduledArgs = {
    where: scheduledWhere,
    orderBy: [{ publishAt: "desc" }, { id: "desc" }],
    select,
  } as const satisfies Prisma.PostFindManyArgs;
  const promotedArgs = {
    where: promotedScheduledWhere,
    orderBy: [{ publishAt: "desc" }, { id: "desc" }],
    select,
  } as const satisfies Prisma.PostFindManyArgs;
  return Promise.all([
    client.post.findMany({ ...publishedArgs, take }) as unknown as Promise<Row[]>,
    client.post.findMany({ ...promotedArgs, take }) as unknown as Promise<Row[]>,
    client.post.findMany({ ...scheduledArgs, take }) as unknown as Promise<Row[]>,
  ]);
}

/** Visible to the public at `now`: published (and its publishAt, if any, has passed) or scheduled and due. */
function publicNow(now = new Date()): Prisma.PostWhereInput {
  return {
    OR: [
      { status: "PUBLISHED", OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
      { status: "SCHEDULED", publishAt: { lte: now } },
    ],
  };
}

export function postRepo(client: DbClient): PostRepo {
  return {
    async listIndexableRefs(take, after) {
      const [published, promoted, scheduled] = await publicPostQueries<PublishedPostRefRow>(client, take, after, true, REF_SELECT);
      return newestFirst([...published, ...promoted, ...scheduled]).slice(0, take);
    },
    listUpcoming(from, to, take, indexableOnly) {
      return client.post.findMany({
        where: {
          status: { in: ["PUBLISHED", "SCHEDULED"] },
          publishAt: { gt: from, lte: to },
          ...(indexableOnly ? { noindex: false } : {}),
        },
        orderBy: [{ publishAt: "asc" }, { id: "asc" }],
        take,
        select: SUMMARY_SELECT,
      }) as unknown as Promise<PublishedPostSummaryRow[]>;
    },
    async listPublishedPage(take, after, indexableOnly, visibleAt) {
      const [published, promoted, scheduled] = await publicPostQueries(client, take, after, indexableOnly, SUMMARY_SELECT, visibleAt);
      return newestFirst([...published, ...promoted, ...scheduled]).slice(0, take);
    },
    listPublicSlugs(visibleAt) {
      return client.post.findMany({ where: publicNow(visibleAt), select: { slug: true, publishAt: true } });
    },
    findPublished(slug, visibleAt) {
      return client.post.findFirst({
        where: { slug, ...publicNow(visibleAt) },
        select: { ...SUMMARY_SELECT, contentHtml: true },
      });
    },
    find(id) {
      return client.post.findUnique({ where: { id } });
    },
    async listSlugRedirects() {
      const rows = await client.postSlugRedirect.findMany({ select: { slug: true, post: { select: { slug: true } } } });
      return rows.map((row) => ({ slug: row.slug, targetSlug: row.post.slug }));
    },
    async recordRename(postId, oldSlug, newSlug) {
      if (oldSlug === newSlug) return;
      await client.postSlugRedirect.deleteMany({ where: { slug: newSlug } });
      await client.postSlugRedirect.upsert({ where: { slug: oldSlug }, create: { slug: oldSlug, postId }, update: { postId } });
    },
    async releaseSlug(slug) {
      await client.postSlugRedirect.deleteMany({ where: { slug } });
    },
    findForPreview(id) {
      return client.post.findUnique({ where: { id }, select: { ...SUMMARY_SELECT, contentHtml: true } });
    },
    findWithCoverUrl(id) {
      return client.post.findUnique({ where: { id }, include: { coverMedia: { select: { url: true } } } });
    },
    findMany(ids) {
      return client.post.findMany({ where: { id: { in: ids } } });
    },
    async idBySlug(slug) {
      const row = await client.post.findUnique({ where: { slug }, select: { id: true } });
      return row?.id ?? null;
    },
    async slugsStartingWith(prefix) {
      const rows = await client.post.findMany({ where: { slug: { startsWith: prefix } }, select: { slug: true } });
      // Prisma cannot escape LIKE wildcards, so `_` or `%` in the prefix may match
      // more rows; keep only the true prefix matches.
      return rows.map((row) => row.slug).filter((slug) => slug.startsWith(prefix));
    },
    async topics() {
      const rows = await client.post.findMany({ distinct: ["topic"], select: { topic: true }, orderBy: { topic: "asc" } });
      return rows.map((row) => row.topic);
    },
    async tagLists(limit, excludeId) {
      const rows = await client.post.findMany({
        where: excludeId ? { id: { not: excludeId } } : undefined,
        select: { tags: true },
        take: limit,
      });
      return rows.map((row) => row.tags);
    },
    async adminPage({ q, status, skip, take }) {
      const where: Prisma.PostWhereInput = {
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
        ...(status ? { status } : {}),
      };
      const [rows, total] = await Promise.all([
        client.post.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          select: { id: true, slug: true, title: true, topic: true, status: true, publishAt: true, publishedAt: true, updatedAt: true },
          skip,
          take,
        }),
        client.post.count({ where }),
      ]);
      return { rows, total };
    },
    count() {
      return client.post.count();
    },
    create(input) {
      return translateUnique(() => client.post.create({ data: input }));
    },
    async createMany(input) {
      await client.post.createMany({ data: input });
    },
    async updateIfUnchanged(id, expectedUpdatedAt, changes) {
      try {
        return await translateUnique(() => client.post.update({ where: { id, updatedAt: expectedUpdatedAt }, data: changes }));
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    update(id, changes) {
      return translateUnique(() => client.post.update({ where: { id }, data: changes }));
    },
    async updateMany(ids, changes) {
      await client.post.updateMany({ where: { id: { in: ids } }, data: changes });
    },
    async delete(id) {
      await client.post.delete({ where: { id } });
    },
    async deleteMany(ids) {
      await client.post.deleteMany({ where: { id: { in: ids } } });
    },
  };
}

export function postRevisionRepo(client: DbClient): PostRevisionRepo {
  return {
    async listForPost(postId, limit) {
      const rows = await client.postRevision.findMany({
        where: { postId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, title: true, reason: true, createdAt: true, createdBy: { select: { email: true } } },
      });
      return rows.map(({ createdBy, ...row }) => ({ ...row, authorEmail: createdBy?.email ?? null }));
    },
    findData(id, postId) {
      return client.postRevision.findFirst({ where: { id, postId }, select: { data: true } });
    },
    async create(input) {
      await client.postRevision.create({ data: { ...input, data: input.data as Prisma.InputJsonValue } });
    },
  };
}
