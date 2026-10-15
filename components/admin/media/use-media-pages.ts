"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface MediaPage<T> {
  items: T[];
  nextCursor: string | null;
}

async function fetchMediaPage<T>(search: string, after: string | null, signal: AbortSignal): Promise<MediaPage<T>> {
  const params = new URLSearchParams(search);
  if (after) params.set("after", after);
  const response = await fetch(`/api/admin/media?${params.toString()}`, { cache: "no-store", signal });
  const data = (await response.json().catch(() => null)) as (MediaPage<T> & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error || (after ? "Could not load more media." : "Could not load media."));
  return data;
}

const isAbort = (cause: unknown) => cause instanceof DOMException && cause.name === "AbortError";

/**
 * Server-paged reads of /api/admin/media for the library and the picker.
 * Every filter change (or `refreshKey` bump) starts a new generation with its
 * own AbortController; "Load more" runs under the current generation's
 * controller, so a page still loading for the old filter is aborted instead of
 * being appended to the new results.
 */
export function useMediaPages<T>(filters: Record<string, string | undefined>, options: { enabled?: boolean; refreshKey?: number } = {}) {
  const { enabled = true, refreshKey = 0 } = options;
  const search = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1]))
  ).toString();

  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // Published only when this generation starts fetching: until then the
      // previous (aborted) controller makes loadMore a no-op.
      generation.current = controller;
      setLoading(true);
      setLoadingMore(false);
      setError(null);
      fetchMediaPage<T>(search, null, controller.signal)
        .then((page) => {
          setItems(page.items);
          setNextCursor(page.nextCursor);
        })
        .catch((cause) => {
          if (!isAbort(cause)) setError(cause instanceof Error ? cause.message : "Could not load media.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, search, refreshKey]);

  const loadMore = useCallback(async () => {
    const controller = generation.current;
    // `loading` covers the first page of a new filter, while nextCursor still belongs to the old one.
    if (!controller || controller.signal.aborted || loading || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchMediaPage<T>(search, nextCursor, controller.signal);
      if (controller.signal.aborted) return;
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (!controller.signal.aborted && !isAbort(cause)) setError(cause instanceof Error ? cause.message : "Could not load more media.");
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [loading, loadingMore, nextCursor, search]);

  return { items, nextCursor, loading, loadingMore, error, loadMore };
}
