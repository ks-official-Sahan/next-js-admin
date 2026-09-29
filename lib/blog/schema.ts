import { z } from "zod";

import { isSafeHref } from "@/lib/cms/href";

import { isValidSlug, SLUG_MAX_LENGTH } from "@sahan-sac/blog-kit/slug";

// Zod schemas for a post (design notes, Step 12). Shared by
// lib/actions/blog.ts (admin writes) and prisma/seed-blog.ts (import). The
// editor sends `content` (raw TipTap HTML); `contentHtml`, `contentText` and
// `readMinutes` are computed on save (sanitizeRich + computeReadMinutes), never
// accepted from the client.

export const POST_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
export type PostStatusValue = (typeof POST_STATUSES)[number];

export const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(SLUG_MAX_LENGTH, `Slug must be ${SLUG_MAX_LENGTH} characters or fewer`)
  .refine(isValidSlug, "Slug must be lowercase letters, numbers and hyphens only");

const canonicalUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || isSafeHref(value), "Invalid canonical URL")
  .optional()
  .transform((value) => (value ? value : undefined));

export const postInputSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1, "Title is required").max(200),
  excerpt: z.string().trim().max(500).optional(),
  content: z.string().trim().min(1, "Content is required").max(200_000),
  topic: z.string().trim().min(1, "Topic is required").max(50),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  coverMediaId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  coverAlt: z.string().trim().max(200).optional(),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(200).optional(),
  canonicalUrl: canonicalUrlSchema,
  // A checkbox: present ("on") means checked, absent means unchecked.
  noindex: z.preprocess((value) => value === true || value === "on" || value === "true" || value === "1", z.boolean()),
});

export type PostInput = z.infer<typeof postInputSchema>;

export const publishActionSchema = z.enum(["publish", "schedule", "unpublish", "archive"]);
export type PublishAction = z.infer<typeof publishActionSchema>;

export const scheduleInputSchema = z.object({
  publishAt: z
    .string()
    .trim()
    .min(1, "A publish date and time is required")
    .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date"),
});
