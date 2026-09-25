import "server-only";

import { db } from "@/lib/db/prisma";

import { REVISIONS_KEPT } from "./revisions";

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
  const rows = await db.postRevision.findMany({
    where: { postId },
    orderBy: { createdAt: "desc" },
    take: REVISIONS_KEPT,
    select: { id: true, title: true, reason: true, createdAt: true, createdBy: { select: { email: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    authorEmail: row.createdBy?.email ?? null,
  }));
}
