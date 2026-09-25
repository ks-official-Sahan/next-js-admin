import { z } from "zod";

import { isSafeHref } from "./href";

// Building blocks for section schemas. Every text has a limit, every link is
// checked, and every list has bounds, so nothing unbounded or unsafe reaches the
// database or the page (design notes, sections 6 and 8).

// The link rule lives in ./href (no imports) so the browser editor uses the same one.
export { isSafeHref };

/** A required single-line text. */
export const str = (max = 200) => z.string().trim().min(1, "Required").max(max, `Use at most ${max} characters`);

/** A single-line text that may be empty. */
export const optStr = (max = 200) => z.string().trim().max(max, `Use at most ${max} characters`);

/** A required multi-line text. */
export const long = (max = 1200) => z.string().trim().min(1, "Required").max(max, `Use at most ${max} characters`);

/** A multi-line text that may be empty. */
export const optLong = (max = 1200) => z.string().trim().max(max, `Use at most ${max} characters`);

export const href = z
  .string()
  .trim()
  .refine(isSafeHref, "Use a path such as /contact, an anchor, or an https, mailto or tel link");

export const linkSchema = z.object({ label: str(60), href });

/** A list of plain strings with bounds. */
export const strings = (min: number, max: number, itemMax = 200) =>
  z.array(str(itemMax)).min(min, `Add at least ${min}`).max(max, `Use at most ${max}`);

/** A list of items with bounds. */
export const items = <T extends z.ZodType>(item: T, min: number, max: number) =>
  z.array(item).min(min, `Add at least ${min}`).max(max, `Use at most ${max}`);
