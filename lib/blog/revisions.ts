import { z } from "zod";

// Post revisions (prisma/schema.prisma, PostRevision): before an edit or a
// restore replaces a post's editable fields, the old values are stored as one
// JSON snapshot. Pure and isomorphic, so the snapshot shape is unit tested
// and a row written by an older shape still parses (missing optional fields
// fall back to their defaults instead of failing the whole restore).

/** Newest revisions kept per post; lib/cron/jobs.ts prunes the rest. */
export const REVISIONS_KEPT = 25;

export const REVISION_REASONS = ["update", "restore", "ai"] as const;
export type RevisionReason = (typeof REVISION_REASONS)[number];

const nullableText = z.string().nullable().default(null);

export const postSnapshotSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  excerpt: nullableText,
  content: z.string(),
  topic: z.string().min(1),
  tags: z.array(z.string()).default([]),
  coverMediaId: nullableText,
  coverAlt: nullableText,
  seoTitle: nullableText,
  seoDescription: nullableText,
  canonicalUrl: nullableText,
  noindex: z.boolean().default(false),
});

export type PostSnapshot = z.infer<typeof postSnapshotSchema>;

/** The editable fields of a post row, as stored in a revision. */
export function snapshotOf(post: PostSnapshot): PostSnapshot {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    topic: post.topic,
    tags: [...post.tags],
    coverMediaId: post.coverMediaId,
    coverAlt: post.coverAlt,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    canonicalUrl: post.canonicalUrl,
    noindex: post.noindex,
  };
}

/** A stored snapshot, or null when the row is unreadable (never restore a guess). */
export function parseSnapshot(data: unknown): PostSnapshot | null {
  const parsed = postSnapshotSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** True when saving `next` over `current` changes nothing a revision would record. */
export function sameSnapshot(current: PostSnapshot, next: PostSnapshot): boolean {
  return JSON.stringify(snapshotOf(current)) === JSON.stringify(snapshotOf(next));
}
