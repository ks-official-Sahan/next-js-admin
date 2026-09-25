import { AdminFetchError } from "@/lib/cache/query-keys";

/**
 * GET a same-origin admin JSON route. The session cookie rides along
 * (same-origin), the browser cache is bypassed (admin data is no-store end to
 * end), and React Query's abort signal cancels a request whose result is no
 * longer wanted, e.g. a search superseded by the next keystroke.
 */
export async function fetchAdminJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new AdminFetchError(response.status);
  return (await response.json()) as T;
}
