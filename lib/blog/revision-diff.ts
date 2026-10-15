import "server-only";

import { diffValues, type DiffRow } from "@/lib/admin/diff";
import { diffLines, type LineOp } from "@/lib/admin/text-diff";
import { extractText } from "@/lib/cms/rich-text";

import type { PostSnapshot } from "@sahan-sac/blog-kit/revisions";

// A revision compared with the post as it is now: changed fields as rows, and
// the body as a paragraph-level line diff (a field diff of the HTML would be
// one unreadable "changed" row).

export interface RevisionComparison {
  fields: DiffRow[];
  content: LineOp[];
}

const BLOCK_END = /<\/(?:p|h[1-6]|li|blockquote|pre|figcaption|td|th)>|<br\s*\/?>|<hr\s*\/?>/gi;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** The body as one line per paragraph, heading or list item, tags stripped. */
export function bodyLines(html: string): string[] {
  return html
    .split(BLOCK_END)
    .map((chunk) => extractText(chunk).replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity]))
    .filter((line) => line.length > 0);
}

export function compareSnapshots(revision: PostSnapshot, current: PostSnapshot): RevisionComparison {
  const { content: revisionBody, ...revisionFields } = revision;
  const { content: currentBody, ...currentFields } = current;
  return {
    fields: diffValues(revisionFields, currentFields),
    content: diffLines(bodyLines(revisionBody), bodyLines(currentBody)),
  };
}
