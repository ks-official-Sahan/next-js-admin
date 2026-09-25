// Placeholder image tokens the AI-generated Markdown body uses in place of a
// real media URL (lib/ai/blog-prompts.ts's contentImageToken) until the
// image itself finishes generating (lib/ai/image.ts) — or forever, if image
// generation is unavailable or the attempt fails. Pure and isomorphic (no
// "server-only"): the admin's browser calls this as each streamed `image`
// event arrives (components/admin/blog/AiAssistantCard.tsx) to update the
// Markdown source of truth, which is then re-rendered to HTML.

export interface ResolvedImage {
  url: string;
  alt: string;
  caption?: string;
}

/** Escapes a string for safe use inside a RegExp built from it. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces every occurrence of `token` in a Markdown body with either the
 * resolved image's real URL (generation succeeded — the surrounding
 * `![alt](url "caption")` now points at a real media asset) or a short,
 * clearly-labelled placeholder note in its place (generation is unavailable
 * or failed), so the admin gets a prompt to fill it in from the library
 * instead of a dead `<img>` tag.
 */
/** Removes every `![alt](token "caption")` image that uses `token`, with its line, for a post whose inline images are turned off. */
export function removeImageToken(markdown: string, token: string): string {
  if (!markdown.includes(token)) return markdown;
  const pattern = new RegExp(`[ \\t]*!\\[[^\\]]*\\]\\(${escapeRegExp(token)}(?:\\s+"[^"]*")?\\)[ \\t]*\\n?`, "g");
  return markdown.replace(pattern, "").replace(/\n{3,}/g, "\n\n");
}

export function applyImageToken(markdown: string, token: string, resolved: ResolvedImage | null): string {
  if (!markdown.includes(token)) return markdown;
  if (resolved) return markdown.split(token).join(resolved.url);

  const pattern = new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegExp(token)}(?:\\s+"[^"]*")?\\)`, "g");
  return markdown.replace(pattern, (_match, alt: string) => {
    const label = alt || "image";
    return `*(Add an image here — ${label}. Use "Choose from library" or the AI Image Prompt to fill it in.)*`;
  });
}
