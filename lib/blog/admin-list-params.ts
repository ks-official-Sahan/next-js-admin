import { z } from "zod";

import { POST_STATUSES, type PostStatusValue } from "./schema";

// The admin blog list's URL state (?page, ?q, ?status) and row shape. Pure and
// isomorphic: the server page, the /api/admin/blog route and the client list
// parse the same params the same way, so a URL always means one query.

export const ADMIN_POSTS_PAGE_SIZE = 20;

export const ADMIN_POST_STATUS_FILTERS = ["all", ...POST_STATUSES] as const;
export type AdminPostStatusFilter = (typeof ADMIN_POST_STATUS_FILTERS)[number];

export interface AdminPostRow {
  id: string;
  slug: string;
  title: string;
  topic: string;
  status: PostStatusValue;
  publishAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminPostPage {
  posts: AdminPostRow[];
  total: number;
  page: number;
  totalPages: number;
}

const paramsSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  q: z.string().trim().max(100).catch(""),
  status: z.enum(ADMIN_POST_STATUS_FILTERS).catch("all"),
});

export type AdminPostListParams = z.infer<typeof paramsSchema>;

interface ParamSource {
  get(name: string): string | null;
}

/** Anything malformed falls back to the default instead of failing the page. */
export function parseAdminPostListParams(source: ParamSource): AdminPostListParams {
  return paramsSchema.parse({
    page: source.get("page") ?? undefined,
    q: source.get("q") ?? undefined,
    status: source.get("status") ?? undefined,
  });
}

/** The query string for `params`, leaving defaults out so URLs stay short. */
export function adminPostListSearch(params: AdminPostListParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status !== "all") search.set("status", params.status);
  if (params.page > 1) search.set("page", String(params.page));
  return search.toString();
}
