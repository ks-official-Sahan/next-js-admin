// Read time from plain text (design notes, Step 12). Pure, no
// imports. Called on save (lib/actions/blog.ts) after sanitizeRich() produces
// contentText, and by the seed script for imported posts.

const WORDS_PER_MINUTE = 200;

export function computeReadMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
