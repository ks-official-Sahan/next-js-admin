import type { Prisma } from "@prisma/client";

import { reviveDates, type TrashEntity } from "@/lib/trash/policy";

import { TrashRestoreError, type TrashItem, type TrashRepo, type TrashRow } from "../trash";
import type { DbClient } from "./client";
import { translateUnique } from "./errors";

const ROW_SELECT = { id: true, entityType: true, entityId: true, label: true, deletedById: true, deletedAt: true } as const;

type Json = Prisma.InputJsonValue;
type Snapshot = Record<string, unknown>;

/** The ids among `ids` that still exist in `table`. */
async function existing(client: DbClient, table: "user" | "mediaAsset", ids: Array<string | null | undefined>): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Set();
  const rows =
    table === "user"
      ? await client.user.findMany({ where: { id: { in: wanted } }, select: { id: true } })
      : await client.mediaAsset.findMany({ where: { id: { in: wanted } }, select: { id: true } });
  return new Set(rows.map((row) => row.id));
}

async function restorePost(client: DbClient, data: Snapshot): Promise<void> {
  const { revisions = [], slugRedirects = [], ...post } = reviveDates(data.post as Snapshot) as Snapshot & {
    revisions?: Snapshot[];
    slugRedirects?: Snapshot[];
  };
  // A cover, author or revision author deleted since is dropped, not a failure.
  const users = await existing(client, "user", [post.authorId as string, ...revisions.map((revision) => revision.createdById as string)]);
  const media = await existing(client, "mediaAsset", [post.coverMediaId as string]);
  if (post.authorId && !users.has(post.authorId as string)) post.authorId = null;
  if (post.coverMediaId && !media.has(post.coverMediaId as string)) post.coverMediaId = null;
  await client.post.create({ data: post as Prisma.PostUncheckedCreateInput });
  if (revisions.length > 0) {
    await client.postRevision.createMany({
      data: revisions.map((revision) => ({
        ...(revision as Prisma.PostRevisionCreateManyInput),
        createdById: users.has(revision.createdById as string) ? (revision.createdById as string) : null,
      })),
    });
  }
  if (slugRedirects.length > 0) {
    await client.postSlugRedirect.createMany({ data: slugRedirects as Prisma.PostSlugRedirectCreateManyInput[], skipDuplicates: true });
  }
}

export function trashRepo(client: DbClient): TrashRepo {
  return {
    async put(items) {
      if (items.length === 0) return;
      await client.trashItem.deleteMany({
        where: { OR: items.map((item) => ({ entityType: item.entityType, entityId: item.entityId })) },
      });
      await client.trashItem.createMany({
        data: items.map((item) => ({ ...item, data: item.data as Json })),
      });
    },
    async snapshotPosts(ids) {
      const posts = await client.post.findMany({ where: { id: { in: ids } }, include: { revisions: true, slugRedirects: true } });
      return posts.map((post) => ({ id: post.id, label: post.title, data: { post } }));
    },
    async list(take) {
      return (await client.trashItem.findMany({ orderBy: [{ deletedAt: "desc" }, { id: "desc" }], take, select: ROW_SELECT })) as TrashRow[];
    },
    async find(id) {
      return (await client.trashItem.findUnique({ where: { id } })) as TrashItem | null;
    },
    async remove(ids) {
      if (ids.length === 0) return 0;
      const { count } = await client.trashItem.deleteMany({ where: { id: { in: ids } } });
      return count;
    },
    async expired(cutoff, take) {
      return (await client.trashItem.findMany({ where: { deletedAt: { lt: cutoff } }, orderBy: { deletedAt: "asc" }, take })) as TrashItem[];
    },
    async restore(entityType: TrashEntity, data) {
      const snapshot = data as Snapshot;
      await translateUnique(async () => {
        switch (entityType) {
          case "Post":
            return restorePost(client, snapshot);
          case "MediaAsset":
            await client.mediaAsset.create({ data: reviveDates(snapshot.asset) as Prisma.MediaAssetUncheckedCreateInput });
            return;
        }
      });
    },
  };
}
