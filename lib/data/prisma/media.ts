import type { MediaRepo } from "../media";
import type { DbClient } from "./client";

export function mediaRepo(client: DbClient): MediaRepo {
  return {
    find(id) {
      return client.mediaAsset.findUnique({ where: { id } });
    },
    findWithUsages(id) {
      return client.mediaAsset.findUnique({
        where: { id },
        include: { usages: { select: { id: true, entityType: true, entityId: true, field: true } } },
      });
    },
    listRecent(limit) {
      return client.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    },
    create(input) {
      return client.mediaAsset.create({ data: input });
    },
    async createIfMissing(input) {
      await client.mediaAsset.upsert({
        where: { provider_publicId: { provider: input.provider, publicId: input.publicId } },
        create: input,
        update: {},
      });
    },
    updateMetadata(id, input) {
      return client.mediaAsset.update({ where: { id }, data: input });
    },
    async delete(id) {
      await client.mediaAsset.delete({ where: { id } });
    },
    async recordUsage(input) {
      await client.mediaUsage.upsert({
        where: { mediaId_entityType_entityId_field: input },
        update: {},
        create: input,
      });
    },
    async clearUsage(entityType, entityId) {
      await client.mediaUsage.deleteMany({ where: { entityType, entityId } });
    },
  };
}
