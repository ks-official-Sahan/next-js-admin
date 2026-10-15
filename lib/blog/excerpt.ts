// The excerpt a list shows for a post without a hand-written one: the start
// of its plain text, computed once on save and stored as posts.autoExcerpt,
// so a list read never loads the whole text just to cut 200 characters.

export const EXCERPT_CHARS = 200;

export function autoExcerptOf(contentText: string): string {
  return contentText.replace(/\s+/g, " ").trim().slice(0, EXCERPT_CHARS);
}
