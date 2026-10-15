import type { Prisma } from "@prisma/client";

import type { MediaRepo } from "../media";
import type { DbClient } from "./client";
import { table } from "./raw";
import { normalizeTags } from "@/lib/media/tags";

export function mediaRepo(client: DbClient): MediaRepo {
  return {
    find(id) {
      return client.mediaAsset.findUnique({ where: { id } });
    },
    findMany(ids) {
      return ids.length === 0 ? Promise.resolve([]) : client.mediaAsset.findMany({ where: { id: { in: ids } } });
    },
    async findWithUsages(id) {
      const asset = await client.mediaAsset.findUnique({
        where: { id },
        include: { usages: { select: { id: true, entityType: true, entityId: true, field: true } } },
      });
      if (!asset) return null;

      // Older rows may predate MediaUsage tracking: cover-media foreign keys are
      // checked directly before deletion too. Every current save records a
      // MediaUsage row in its own transaction, so the delete path's
      // lockForUpdate() is what makes a concurrent save and delete safe; this
      // scan only covers rows written before tracking.
      const legacyPostCovers = await client.post.findMany({ where: { coverMediaId: id }, select: { id: true }, take: 100 });
      const usages = new Map(asset.usages.map((usage) => [`${usage.entityType}:${usage.entityId}:${usage.field}`, usage]));
      for (const post of legacyPostCovers) {
        const key = `Post:${post.id}:cover`;
        if (!usages.has(key)) usages.set(key, { id: `legacy:${key}`, entityType: "Post", entityId: post.id, field: "cover" });
      }
      return { ...asset, usages: [...usages.values()] };
    },
    async lockForUpdate(id) {
      await client.$queryRaw`SELECT id FROM ${table("media_assets")} WHERE id = ${id} FOR UPDATE`;
    },
    listPage({ query, kind, after, take }) {
      // Substring match, so "logo" finds "company logo". Unindexed ILIKE is fine
      // for an admin library of this size: the scan walks the createdAt order
      // and stops at `take` matches. Add a pg_trgm GIN index if it grows large.
      const trimmed = query?.trim();
      // Tags are stored normalized (lib/media/tags.ts); tags saved before that
      // kept their casing, so the term as typed is matched too.
      const tagTerms = trimmed ? [...new Set([...normalizeTags([trimmed]), trimmed])] : [];
      const where: Prisma.MediaAssetWhereInput = {
        ...(kind ? { kind } : {}),
        ...(trimmed
          ? {
              OR: [
                { title: { contains: trimmed, mode: "insensitive" } },
                { publicId: { contains: trimmed, mode: "insensitive" } },
                { alt: { contains: trimmed, mode: "insensitive" } },
                { folder: { contains: trimmed, mode: "insensitive" } },
                { tags: { hasSome: tagTerms } },
              ],
            }
          : {}),
        ...(after
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: after.createdAt } },
                    { createdAt: after.createdAt, id: { lt: after.id } },
                  ],
                },
              ],
            }
          : {}),
      };
      return client.mediaAsset.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take });
    },
    listRecent(limit) {
      return client.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    },
    create(input) {
      return client.mediaAsset.create({ data: input });
    },
    async existsByPublicId(provider, accountId, publicId) {
      const row = await client.mediaAsset.findUnique({ where: { provider_accountId_publicId: { provider, accountId, publicId } }, select: { id: true } });
      return row !== null;
    },
    async bytesByAccount() {
      const groups = await client.mediaAsset.groupBy({ by: ["accountId"], where: { provider: { not: "LOCAL" } }, _sum: { sizeBytes: true } });
      return Object.fromEntries(groups.map((group) => [group.accountId, group._sum.sizeBytes ?? 0]));
    },
    async createIfMissing(input) {
      await client.mediaAsset.upsert({
        where: { provider_accountId_publicId: { provider: input.provider, accountId: input.accountId ?? "cloudinary", publicId: input.publicId } },
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
    async recordUsages(inputs) {
      if (inputs.length > 0) await client.mediaUsage.createMany({ data: inputs, skipDuplicates: true });
    },
    async clearUsage(entityType, entityIds) {
      if (typeof entityIds !== "string" && entityIds.length === 0) return;
      await client.mediaUsage.deleteMany({
        where: { entityType, entityId: typeof entityIds === "string" ? entityIds : { in: [...entityIds] } },
      });
    },
  };
}
