// TanStack Query keys and defaults for the admin panel. Pure (no React, no
// "use client"), so the server page that prefetches a query and the client
// hook that reads it build the exact same key.
//
// React Query lives only in the admin. The public site is server rendered and
// CDN/ISR cached; a client cache there would add bundle weight to every page
// and a second copy of data the CDN already serves.

import type { AdminPostListParams } from "@/lib/blog/admin-list-params";

/** An HTTP failure from an admin JSON route; 4xx means retrying cannot help. */
export class AdminFetchError extends Error {
  constructor(readonly status: number) {
    super(status === 404 ? "Your session may have ended. Reload the page to sign in again." : `Request failed (${status}).`);
  }
}

export const ADMIN_QUERY_DEFAULTS = {
  queries: {
    // Fresh long enough that a server prefetch is not refetched on hydration,
    // short enough that a returning tab shows recent edits.
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: (failureCount: number, error: unknown) =>
      !(error instanceof AdminFetchError && error.status < 500) && failureCount < 2,
  },
  mutations: {
    // Mutations are never retried automatically: a write that reached the
    // server but lost its response must not run twice.
    retry: false,
  },
} as const;

export interface ChatbotSessionListParams {
  limit: number;
  offset: number;
}

export const queryKeys = {
  admin: {
    blogPosts: {
      all: ["admin", "blog", "posts"] as const,
      list: (params: AdminPostListParams) => ["admin", "blog", "posts", params] as const,
    },
    chatbotSessions: {
      all: ["admin", "chatbot", "sessions"] as const,
      list: (params: ChatbotSessionListParams) => ["admin", "chatbot", "sessions", params] as const,
    },
  },
} as const;
