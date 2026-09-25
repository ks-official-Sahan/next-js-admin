import "server-only";

import { cached } from "@/lib/cache/cached";
import { loadOrNull } from "@/lib/cache/fallback";
import { TAGS } from "@/lib/cache/tags";
import { db } from "@/lib/db/prisma";
import { log } from "@/lib/log";

import { resolveSection } from "./merge";
import { sectionsOf, type CmsPage, type PageContent } from "./registry";

// Public reads of CMS content (design notes, section 5.2).
//
// One query per page, cached under the page tag. A section that is not stored, or
// whose stored block no longer validates, renders its code default. `null` from
// the store means "use defaults" and happens only when no database is configured
// or a read fails during `next build` (D4); a failed read at runtime throws, so a
// stale ISR page keeps being served instead of a wrong default. The fallback is
// produced outside the cache, so it is never cached.

type StoredPage = Record<string, unknown>;

const readers = new Map<CmsPage, () => Promise<StoredPage>>();

function readerFor(page: CmsPage): () => Promise<StoredPage> {
  let read = readers.get(page);
  if (!read) {
    read = cached(
      async () => {
        const rows = await db.contentBlock.findMany({
          where: { pageSlug: page, status: "PUBLISHED" },
          select: { sectionSlug: true, data: true },
        });
        return Object.fromEntries(rows.map((row) => [row.sectionSlug, row.data])) as StoredPage;
      },
      ["cms", "page", page],
      { tags: [TAGS.cms, TAGS.page(page)] }
    );
    readers.set(page, read);
  }
  return read;
}

/** Published blocks of a page, or null when the defaults should be used. */
export function getStoredPage(page: CmsPage): Promise<StoredPage | null> {
  return loadOrNull(readerFor(page), {
    onError: (error) => log.warn("cms read failed during build, using defaults", { page, error: String(error) }),
  });
}

/** Defaults with the stored blocks laid over them, section by section. */
export function mergePage<P extends CmsPage>(page: P, stored: StoredPage | null): PageContent<P> {
  const out: Record<string, unknown> = {};
  for (const [key, definition] of Object.entries(sectionsOf(page))) {
    out[key] = resolveSection(definition.schema, definition.defaults(), stored?.[key], (reason) =>
      log.warn("stored cms block ignored, using defaults", { page, section: key, reason })
    ).data;
  }
  return out as PageContent<P>;
}

/** Everything a public page needs, ready to pass down as props. */
export async function getPageContent<P extends CmsPage>(page: P): Promise<PageContent<P>> {
  return mergePage(page, await getStoredPage(page));
}

const lastModifiedReaders = new Map<CmsPage, () => Promise<string | null>>();

function lastModifiedReaderFor(page: CmsPage): () => Promise<string | null> {
  let read = lastModifiedReaders.get(page);
  if (!read) {
    read = cached(
      async () => {
        const row = await db.contentBlock.findFirst({
          where: { pageSlug: page, status: "PUBLISHED" },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true },
        });
        // ISO string, not a Date: unstable_cache's data cache round-trips
        // through JSON, so a Date instance would come back a string on a
        // cache hit anyway and a string on a miss — returning a string
        // always keeps the type honest for callers.
        return row ? row.updatedAt.toISOString() : null;
      },
      ["cms", "page-updated-at", page],
      { tags: [TAGS.cms, TAGS.page(page)] }
    );
    lastModifiedReaders.set(page, read);
  }
  return read;
}

/**
 * Newest `updatedAt` among a page's published content blocks, as an ISO
 * string, for sitemap `lastModified`. Null when the database is not
 * configured, the page has no stored blocks yet, or the read fails during
 * `next build` — callers should fall back to something reasonable (see
 * app/sitemap.ts).
 */
export function getPageLastModified(page: CmsPage): Promise<string | null> {
  return loadOrNull(lastModifiedReaderFor(page), {
    onError: (error) =>
      log.warn("cms lastModified read failed during build, falling back", { page, error: String(error) }),
  });
}
