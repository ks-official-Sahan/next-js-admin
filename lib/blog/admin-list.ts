import "server-only";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db/prisma";

import { ADMIN_POSTS_PAGE_SIZE, type AdminPostListParams, type AdminPostPage } from "./admin-list-params";

/**
 * One page of the admin blog list: the single implementation behind both the
 * server render (prefetched into React Query) and /api/admin/blog (the client
 * refetch), so the two can never disagree. Never selects a post body, so a
 * page stays small however long the posts are; rows and total run together.
 */
export async function listAdminPosts(params: AdminPostListParams): Promise<AdminPostPage> {
  const where: Prisma.PostWhereInput = {
    ...(params.q ? { title: { contains: params.q, mode: "insensitive" } } : {}),
    ...(params.status !== "all" ? { status: params.status } : {}),
  };

  const [rows, total] = await Promise.all([
    db.post.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, title: true, topic: true, status: true, publishAt: true, publishedAt: true, updatedAt: true },
      skip: (params.page - 1) * ADMIN_POSTS_PAGE_SIZE,
      take: ADMIN_POSTS_PAGE_SIZE,
    }),
    db.post.count({ where }),
  ]);

  return {
    posts: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      topic: row.topic,
      status: row.status,
      publishAt: row.publishAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
    page: params.page,
    totalPages: Math.max(1, Math.ceil(total / ADMIN_POSTS_PAGE_SIZE)),
  };
}
