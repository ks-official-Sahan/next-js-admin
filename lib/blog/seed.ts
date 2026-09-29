import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { UpdatesContent } from "@/contents/updates";
import { sanitizeRich, extractText } from "@/lib/cms/rich-text";

import { computeReadMinutes } from "@sahan-sac/blog-kit/readtime";
import { ensureUniqueSlug, slugify } from "@sahan-sac/blog-kit/slug";

// Idempotent import of `UpdatesContent.posts` as published posts. Only runs when the Post table is empty, so an
// edited or newly authored post is never touched or duplicated. Called from
// prisma/seed-blog.ts, never run against the real database by this agent.

type SeedClient = Pick<PrismaClient, "post">;

export interface SeedBlogResult {
  ok: true;
  created: number;
  skipped: boolean;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export async function seedBlog(client: SeedClient): Promise<SeedBlogResult> {
  const existing = await client.post.count();
  if (existing > 0) return { ok: true, created: 0, skipped: true };

  const taken = new Set<string>();
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const rows: Prisma.PostCreateManyInput[] = UpdatesContent.posts.map((post, index) => {
    const slug = ensureUniqueSlug(slugify(post.title) || post.id, taken);
    taken.add(slug);
    const contentHtml = sanitizeRich(`<p>${escapeHtml(post.content)}</p>`);
    const contentText = extractText(contentHtml);
    // Newest entry in the source array gets the most recent timestamp, so
    // sort order (publishedAt desc) matches the array's intended order.
    const publishedAt = new Date(now - index * ONE_DAY_MS);

    return {
      slug,
      title: post.title,
      excerpt: post.content.slice(0, 200),
      content: contentHtml,
      contentHtml,
      contentText,
      topic: post.topic,
      tags: post.tags,
      status: "PUBLISHED",
      publishAt: publishedAt,
      publishedAt,
      readMinutes: computeReadMinutes(contentText),
      generatedByAI: false,
    };
  });

  await client.post.createMany({ data: rows });
  return { ok: true, created: rows.length, skipped: false };
}
