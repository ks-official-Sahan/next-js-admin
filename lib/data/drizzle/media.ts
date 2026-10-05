import { and, desc, eq } from "drizzle-orm";

import { mediaAssets, mediaUsages } from "@/lib/db/schema";

import type { MediaAssetRow, MediaRepo } from "../media";
import { first, one, type DbClient } from "./client";

const asRow = <T extends { tags: string[] | null }>(row: T) => ({ ...row, tags: row.tags ?? [] }) as T & MediaAssetRow;

export function mediaRepo(client: DbClient): MediaRepo {
  const byId = async (id: string) => first(await client.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1));
  return {
    async find(id) {
      const row = await byId(id);
      return row && asRow(row);
    },
    async findWithUsages(id) {
      const [row, usages] = await Promise.all([
        byId(id),
        client
          .select({ id: mediaUsages.id, entityType: mediaUsages.entityType, entityId: mediaUsages.entityId, field: mediaUsages.field })
          .from(mediaUsages)
          .where(eq(mediaUsages.mediaId, id)),
      ]);
      return row && { ...asRow(row), usages };
    },
    async listRecent(limit) {
      return (await client.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(limit)).map(asRow);
    },
    async create(input) {
      return asRow(one(await client.insert(mediaAssets).values(input).returning(), "Media asset"));
    },
    async createIfMissing(input) {
      await client.insert(mediaAssets).values(input).onConflictDoNothing({ target: [mediaAssets.provider, mediaAssets.publicId] });
    },
    async updateMetadata(id, input) {
      return asRow(one(await client.update(mediaAssets).set(input).where(eq(mediaAssets.id, id)).returning(), "Media asset"));
    },
    async delete(id) {
      await client.delete(mediaAssets).where(eq(mediaAssets.id, id));
    },
    async recordUsage(input) {
      await client.insert(mediaUsages).values(input).onConflictDoNothing();
    },
    async clearUsage(entityType, entityId) {
      await client.delete(mediaUsages).where(and(eq(mediaUsages.entityType, entityType), eq(mediaUsages.entityId, entityId)));
    },
  };
}
