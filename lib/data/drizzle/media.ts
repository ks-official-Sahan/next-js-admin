import { and, arrayOverlaps, desc, eq, ilike, inArray, lt, ne, or, sql } from "drizzle-orm";

import { mediaAssets, mediaUsages, posts } from "@/lib/db/schema";
import { normalizeTags } from "@/lib/media/tags";

import type { MediaAssetRow, MediaRepo, MediaUsageRow } from "../media";
import { containsPattern, first, one, type DbClient } from "./client";

const asRow = <T extends { tags: string[] | null }>(row: T) => ({ ...row, tags: row.tags ?? [] }) as T & MediaAssetRow;

/** Mirrors the Prisma reference: at most this many legacy cover links are scanned per asset. */
const LEGACY_COVER_SCAN = 100;

export function mediaRepo(client: DbClient): MediaRepo {
  const byId = async (id: string) => first(await client.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1));
  return {
    async find(id) {
      const row = await byId(id);
      return row && asRow(row);
    },
    async findMany(ids) {
      if (ids.length === 0) return [];
      return (await client.select().from(mediaAssets).where(inArray(mediaAssets.id, ids))).map(asRow);
    },
    async findWithUsages(id) {
      const row = await byId(id);
      if (!row) return null;

      // Older rows may predate MediaUsage tracking: cover-media foreign keys are
      // checked directly before deletion too. Every current save records a
      // MediaUsage row in its own transaction, so the delete path's
      // lockForUpdate() is what makes a concurrent save and delete safe; this
      // scan only covers rows written before tracking.
      const [usageRows, legacyPostCovers] = await Promise.all([
        client
          .select({ id: mediaUsages.id, entityType: mediaUsages.entityType, entityId: mediaUsages.entityId, field: mediaUsages.field })
          .from(mediaUsages)
          .where(eq(mediaUsages.mediaId, id)),
        client.select({ id: posts.id }).from(posts).where(eq(posts.coverMediaId, id)).limit(LEGACY_COVER_SCAN),
      ]);
      const usages = new Map<string, MediaUsageRow>(usageRows.map((usage) => [`${usage.entityType}:${usage.entityId}:${usage.field}`, usage]));
      for (const post of legacyPostCovers) {
        const key = `Post:${post.id}:cover`;
        if (!usages.has(key)) usages.set(key, { id: `legacy:${key}`, entityType: "Post", entityId: post.id, field: "cover" });
      }
      return { ...asRow(row), usages: [...usages.values()] };
    },
    async lockForUpdate(id) {
      await client.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, id)).for("update");
    },
    async listPage({ query, kind, after, take }) {
      // Substring match, so "logo" finds "company logo". Unindexed ILIKE is fine
      // for an admin library of this size: the scan walks the createdAt order
      // and stops at `take` matches. Add a pg_trgm GIN index if it grows large.
      const trimmed = query?.trim();
      // Tags are stored normalized (lib/media/tags.ts); tags saved before that
      // kept their casing, so the term as typed is matched too.
      const tagTerms = trimmed ? [...new Set([...normalizeTags([trimmed]), trimmed])] : [];
      const rows = await client
        .select()
        .from(mediaAssets)
        .where(
          and(
            kind ? eq(mediaAssets.kind, kind) : undefined,
            trimmed
              ? or(
                  ilike(mediaAssets.title, containsPattern(trimmed)),
                  ilike(mediaAssets.publicId, containsPattern(trimmed)),
                  ilike(mediaAssets.alt, containsPattern(trimmed)),
                  ilike(mediaAssets.folder, containsPattern(trimmed)),
                  arrayOverlaps(mediaAssets.tags, tagTerms)
                )
              : undefined,
            after
              ? or(
                  lt(mediaAssets.createdAt, after.createdAt),
                  and(eq(mediaAssets.createdAt, after.createdAt), lt(mediaAssets.id, after.id))
                )
              : undefined
          )
        )
        .orderBy(desc(mediaAssets.createdAt), desc(mediaAssets.id))
        .limit(take);
      return rows.map(asRow);
    },
    async listRecent(limit) {
      return (await client.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt)).limit(limit)).map(asRow);
    },
    async create(input) {
      return asRow(one(await client.insert(mediaAssets).values(input).returning(), "Media asset"));
    },
    async existsByPublicId(provider, accountId, publicId) {
      const row = first(
        await client
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(and(eq(mediaAssets.provider, provider), eq(mediaAssets.accountId, accountId), eq(mediaAssets.publicId, publicId)))
          .limit(1)
      );
      return row !== null;
    },
    async bytesByAccount() {
      const rows = await client
        .select({
          accountId: mediaAssets.accountId,
          bytes: sql<number>`COALESCE(SUM(${mediaAssets.sizeBytes}), 0)`.mapWith(Number),
        })
        .from(mediaAssets)
        .where(ne(mediaAssets.provider, "LOCAL"))
        .groupBy(mediaAssets.accountId);
      return Object.fromEntries(rows.map((row) => [row.accountId, row.bytes]));
    },
    async createIfMissing(input) {
      await client
        .insert(mediaAssets)
        .values(input)
        .onConflictDoNothing({ target: [mediaAssets.provider, mediaAssets.accountId, mediaAssets.publicId] });
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
    async recordUsages(inputs) {
      if (inputs.length > 0) await client.insert(mediaUsages).values(inputs).onConflictDoNothing();
    },
    async clearUsage(entityType, entityIds) {
      if (typeof entityIds !== "string" && entityIds.length === 0) return;
      await client
        .delete(mediaUsages)
        .where(
          and(
            eq(mediaUsages.entityType, entityType),
            typeof entityIds === "string" ? eq(mediaUsages.entityId, entityIds) : inArray(mediaUsages.entityId, [...entityIds])
          )
        );
    },
  };
}
