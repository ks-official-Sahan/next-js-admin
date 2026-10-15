import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";

import { mediaAssets, postRevisions, postSlugRedirects, posts, trashItems, users } from "@/lib/db/schema";
import { reviveDates, type TrashEntity } from "@/lib/trash/policy";

import type { TrashItem, TrashRepo, TrashRow } from "../trash";
import { first, type DbClient } from "./client";
import { translateUnique } from "./errors";

type PostSnapshot = typeof posts.$inferSelect & {
  revisions?: Array<typeof postRevisions.$inferSelect>;
  slugRedirects?: Array<typeof postSlugRedirects.$inferSelect>;
};

const ROW_SELECT = {
  id: trashItems.id,
  entityType: trashItems.entityType,
  entityId: trashItems.entityId,
  label: trashItems.label,
  deletedById: trashItems.deletedById,
  deletedAt: trashItems.deletedAt,
} as const;

/** The ids among `ids` that are users. One query; empty input skips the database. */
async function existingUserIds(client: DbClient, ids: Array<string | null | undefined>): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Set();
  const rows = await client.select({ id: users.id }).from(users).where(inArray(users.id, wanted));
  return new Set(rows.map((row) => row.id));
}

/** The ids among `ids` that are media assets. One query; empty input skips the database. */
async function existingMediaIds(client: DbClient, ids: Array<string | null | undefined>): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Set();
  const rows = await client.select({ id: mediaAssets.id }).from(mediaAssets).where(inArray(mediaAssets.id, wanted));
  return new Set(rows.map((row) => row.id));
}

/**
 * Re-inserts a post snapshot in one transaction. A cover, author or revision
 * author deleted since is dropped (set to null), not a failure.
 */
async function restorePost(client: DbClient, data: { post?: unknown }): Promise<void> {
  const { revisions = [], slugRedirects = [], ...post } = reviveDates(data.post as PostSnapshot);
  const [userIds, mediaIds] = await Promise.all([
    existingUserIds(client, [post.authorId, ...revisions.map((revision) => revision.createdById)]),
    existingMediaIds(client, [post.coverMediaId]),
  ]);
  if (post.authorId && !userIds.has(post.authorId)) post.authorId = null;
  if (post.coverMediaId && !mediaIds.has(post.coverMediaId)) post.coverMediaId = null;

  await client.transaction(async (tx) => {
    await tx.insert(posts).values(post);
    if (revisions.length > 0) {
      await tx.insert(postRevisions).values(
        revisions.map((revision) => ({
          ...revision,
          createdById: revision.createdById && userIds.has(revision.createdById) ? revision.createdById : null,
        }))
      );
    }
    if (slugRedirects.length > 0) {
      await tx.insert(postSlugRedirects).values(slugRedirects).onConflictDoNothing();
    }
  });
}

export function trashRepo(client: DbClient): TrashRepo {
  return {
    async put(items) {
      if (items.length === 0) return;
      await client.delete(trashItems).where(
        or(...items.map((item) => and(eq(trashItems.entityType, item.entityType), eq(trashItems.entityId, item.entityId))))
      );
      await client.insert(trashItems).values(items);
    },
    async snapshotPosts(ids) {
      if (ids.length === 0) return [];
      const rows = await client.select().from(posts).where(inArray(posts.id, ids));
      if (rows.length === 0) return [];
      const postIds = rows.map((post) => post.id);
      const [revisions, redirects] = await Promise.all([
        client.select().from(postRevisions).where(inArray(postRevisions.postId, postIds)),
        client.select().from(postSlugRedirects).where(inArray(postSlugRedirects.postId, postIds)),
      ]);
      const revisionsByPost = new Map<string, typeof revisions>();
      for (const revision of revisions) {
        const group = revisionsByPost.get(revision.postId);
        if (group) group.push(revision);
        else revisionsByPost.set(revision.postId, [revision]);
      }
      const redirectsByPost = new Map<string, typeof redirects>();
      for (const redirect of redirects) {
        const group = redirectsByPost.get(redirect.postId);
        if (group) group.push(redirect);
        else redirectsByPost.set(redirect.postId, [redirect]);
      }
      return rows.map((post) => ({
        id: post.id,
        label: post.title,
        data: {
          post: { ...post, revisions: revisionsByPost.get(post.id) ?? [], slugRedirects: redirectsByPost.get(post.id) ?? [] },
        },
      }));
    },
    async list(take) {
      return (await client
        .select(ROW_SELECT)
        .from(trashItems)
        .orderBy(desc(trashItems.deletedAt), desc(trashItems.id))
        .limit(take)) as TrashRow[];
    },
    async find(id) {
      return first(await client.select().from(trashItems).where(eq(trashItems.id, id)).limit(1)) as TrashItem | null;
    },
    async remove(ids) {
      if (ids.length === 0) return 0;
      const deleted = await client.delete(trashItems).where(inArray(trashItems.id, ids)).returning({ id: trashItems.id });
      return deleted.length;
    },
    async expired(cutoff, take) {
      return (await client
        .select()
        .from(trashItems)
        .where(lt(trashItems.deletedAt, cutoff))
        .orderBy(asc(trashItems.deletedAt))
        .limit(take)) as TrashItem[];
    },
    async restore(entityType: TrashEntity, data) {
      const snapshot = data as Record<string, unknown>;
      await translateUnique(async () => {
        switch (entityType) {
          case "Post":
            return restorePost(client, snapshot);
          case "MediaAsset":
            await client.insert(mediaAssets).values(reviveDates(snapshot.asset) as typeof mediaAssets.$inferInsert);
            return;
        }
      });
    },
  };
}
