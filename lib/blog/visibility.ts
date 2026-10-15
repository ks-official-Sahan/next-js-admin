// A scheduled post is public from its publishAt, but a cached read is filled
// before it is served: the data cache, its Redis copy and the page each keep
// a result up to 300 s, so a post due after the fill used to appear up to
// 15 min late (the publish cron runs daily on Vercel Hobby). Cached reads
// therefore also fetch posts due within VISIBLE_AHEAD_MS, and isDue() drops
// the ones not yet due each time the result is served. What is left is the
// page's own 300 s revalidate.

/** How far past now a cached read looks: longer than the data cache plus Redis can hold a result. */
export const VISIBLE_AHEAD_MS = 20 * 60_000;

/** The `visibleAt` for a cached read. */
export const visibleAhead = (now = Date.now()): Date => new Date(now + VISIBLE_AHEAD_MS);

/**
 * True when a row a cached read returned is public now: no publishAt, or one
 * that has passed. Accepts the ISO string a Redis round trip leaves.
 */
export const isDue = (row: { publishAt: Date | string | null }, now = Date.now()): boolean =>
  row.publishAt === null || new Date(row.publishAt).getTime() <= now;
