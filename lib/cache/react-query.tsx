"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { ADMIN_QUERY_DEFAULTS } from "./query-keys";

/**
 * The admin panel's React Query client, one per browser tab. Server pages
 * prefetch into their own per-request client (lib/cache/query-client.server.ts)
 * and hand the result over through <HydrationBoundary>, which only replaces
 * cached data with data that is newer — so a list rendered after a save never
 * shows the stale copy this client still held.
 */
export function AdminQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: ADMIN_QUERY_DEFAULTS }));
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
