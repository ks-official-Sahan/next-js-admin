"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminPostListSearch, type AdminPostListParams, type AdminPostPage } from "@/lib/blog/admin-list-params";
import { queryKeys } from "@/lib/cache/query-keys";

import { fetchAdminJson } from "./fetch-json";

/**
 * One page of the admin blog list. The server page prefetches the first
 * render; after that, changing page, search or status fetches only the JSON
 * for the list (no page re-render), keeps the previous page on screen while
 * the next one loads, and serves already-visited pages from cache.
 */
export function useAdminBlogPosts(params: AdminPostListParams) {
  return useQuery({
    queryKey: queryKeys.admin.blogPosts.list(params),
    queryFn: ({ signal }) => fetchAdminJson<AdminPostPage>(`/api/admin/blog?${adminPostListSearch(params)}`, signal),
    placeholderData: keepPreviousData,
  });
}

/** Marks every cached blog list page stale after a mutation, refetching the visible one. */
export function useInvalidateAdminBlogPosts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.blogPosts.all });
}
