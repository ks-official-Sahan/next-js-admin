// Slug rules for blog posts (design notes, Step 12). Pure: no
// imports, so both the editor form and the zod schema in lib/actions/blog.ts
// use the same rule. Cache tags built from a slug reuse this same shape
// (lib/cache/tags.ts, isValidPostSlug), kept in sync here rather than
// re-exported, since that file must stay free of a lib/blog dependency.

export const SLUG_MAX_LENGTH = 96;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lowercase, hyphen separated, ascii only, no leading/trailing/double hyphen. */
export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug);
}

/** Turns arbitrary text (a title) into a slug candidate. Not guaranteed unique. */
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
  return base;
}

/**
 * Appends `-2`, `-3`, ... until the slug is not in `existing`. `existing`
 * should exclude the row being edited, if any. Pure: the caller supplies the
 * set of taken slugs (from the database or a test fixture).
 */
export function ensureUniqueSlug(candidate: string, existing: ReadonlySet<string>): string {
  const base = candidate.slice(0, SLUG_MAX_LENGTH) || "post";
  if (!existing.has(base)) return base;

  let suffix = 2;
  let next = "";
  do {
    const suffixText = `-${suffix}`;
    next = `${base.slice(0, SLUG_MAX_LENGTH - suffixText.length)}${suffixText}`;
    suffix += 1;
  } while (existing.has(next));
  return next;
}
