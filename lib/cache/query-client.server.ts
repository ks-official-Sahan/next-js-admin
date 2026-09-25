import "server-only";

import { QueryClient } from "@tanstack/react-query";
import { cache } from "react";

import { ADMIN_QUERY_DEFAULTS } from "./query-keys";

/**
 * A React Query client scoped to one server request (React's cache()), for
 * prefetching in admin Server Components. Never shared across requests, so
 * one user's data can never leak into another user's render.
 */
export const getServerQueryClient = cache(
  () => new QueryClient({ defaultOptions: { queries: { staleTime: ADMIN_QUERY_DEFAULTS.queries.staleTime } } })
);
