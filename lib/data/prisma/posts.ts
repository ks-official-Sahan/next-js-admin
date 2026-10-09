import type { Prisma } from "@prisma/client";

import type { PostRepo, PostRevisionRepo } from "../posts";
import type { DbClient } from "./client";
import { isNotFound, translateUnique } from "./errors";

/** The public visibility rule: status alone, never publishAt. */
export const PUBLISHED_WHERE = { status: "PUBLISHED" } as const;

const SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
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

export function postRepo(client: DbClient): PostRepo {
  return {
    listPublished() {
      return client.post.findMany({ where: PUBLISHED_WHERE, orderBy: { publishedAt: "desc" }, select: SUMMARY_SELECT });
    },
    findPublished(slug) {
      return client.post.findFirst({ where: { ...PUBLISHED_WHERE, slug }, select: { ...SUMMARY_SELECT, contentHtml: true } });
    },
    find(id) {
      return client.post.findUnique({ where: { id } });
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
