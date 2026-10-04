import "server-only";

import { repos } from "@/lib/data";

import { REVISIONS_KEPT } from "@sahan-sac/blog-kit/revisions";

export interface RevisionListItem {
  id: string;
  title: string;
  reason: string;
  createdAt: string;
  authorEmail: string | null;
}

/**
 * A post's history for the editor, newest first. One query (the author is a
 * joined relation) and no snapshot bodies: `title` is stored beside `data`
 * for exactly this list.
 */
export async function listPostRevisions(postId: string): Promise<RevisionListItem[]> {
  const rows = await repos.postRevisions.listForPost(postId, REVISIONS_KEPT);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
