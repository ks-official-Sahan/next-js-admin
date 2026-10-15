const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

/**
 * Tags as stored and searched: trimmed, lowercased, letters, digits, spaces
 * and hyphens only, unique, at most MAX_TAGS of MAX_TAG_LENGTH characters.
 * Anything else is dropped rather than refused, since tags are a convenience.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (tag.length === 0 || tag.length > MAX_TAG_LENGTH || !/^[\p{L}\p{N} _-]+$/u.test(tag)) continue;
    out.add(tag);
    if (out.size === MAX_TAGS) break;
  }
  return [...out];
}
