import { and, desc, eq, inArray } from "drizzle-orm";

import { contentBlocks } from "@/lib/db/schema";

import type { ContentBlockRepo } from "../content";
import { countRows, first, one, type DbClient } from "./client";
import { translateUnique } from "./errors";

const blockColumns = {
  id: contentBlocks.id,
  version: contentBlocks.version,
  status: contentBlocks.status,
  data: contentBlocks.data,
  note: contentBlocks.note,
  publishedAt: contentBlocks.publishedAt,
  updatedAt: contentBlocks.updatedAt,
  createdById: contentBlocks.createdById,
  publishedById: contentBlocks.publishedById,
};

export function contentBlockRepo(client: DbClient): ContentBlockRepo {
  const section = (page: string, slug: string) => and(eq(contentBlocks.pageSlug, page), eq(contentBlocks.sectionSlug, slug));
  const draft = (id: string, expectedUpdatedAt: Date) =>
    and(eq(contentBlocks.id, id), eq(contentBlocks.status, "DRAFT"), eq(contentBlocks.updatedAt, expectedUpdatedAt));
  return {
    listSection(page, slug) {
      return client.select(blockColumns).from(contentBlocks).where(section(page, slug)).orderBy(desc(contentBlocks.version));
    },
    countSection(page, slug) {
      return countRows(client, contentBlocks, section(page, slug));
    },
    listPageStates(page) {
      return client
        .select({
          sectionSlug: contentBlocks.sectionSlug,
          status: contentBlocks.status,
          version: contentBlocks.version,
          publishedAt: contentBlocks.publishedAt,
          updatedAt: contentBlocks.updatedAt,
        })
        .from(contentBlocks)
        .where(and(eq(contentBlocks.pageSlug, page), inArray(contentBlocks.status, ["DRAFT", "PUBLISHED"])));
    },
    async listPageData(page, statuses) {
      if (statuses.length === 0) return [];
      return client
        .select({ sectionSlug: contentBlocks.sectionSlug, status: contentBlocks.status, data: contentBlocks.data })
        .from(contentBlocks)
        .where(and(eq(contentBlocks.pageSlug, page), inArray(contentBlocks.status, statuses)));
    },
    async lastPublishedUpdate(page) {
      const row = first(
        await client
          .select({ updatedAt: contentBlocks.updatedAt })
          .from(contentBlocks)
          .where(and(eq(contentBlocks.pageSlug, page), eq(contentBlocks.status, "PUBLISHED")))
          .orderBy(desc(contentBlocks.updatedAt))
          .limit(1)
      );
      return row?.updatedAt ?? null;
    },
    create(input) {
      return translateUnique(async () =>
        one(
          await client.insert(contentBlocks).values(input).returning({ version: contentBlocks.version, updatedAt: contentBlocks.updatedAt }),
          "Content block"
        )
      );
    },
    async updateDraftData(id, expectedUpdatedAt, data) {
      const rows = await client.update(contentBlocks).set({ data }).where(draft(id, expectedUpdatedAt)).returning({ id: contentBlocks.id });
      return rows.length === 1;
    },
    async supersede(id) {
      await client
        .update(contentBlocks)
        .set({ status: "SUPERSEDED" })
        .where(and(eq(contentBlocks.id, id), eq(contentBlocks.status, "PUBLISHED")));
    },
    async publishDraft(id, expectedUpdatedAt, input) {
      const rows = await client
        .update(contentBlocks)
        .set({ status: "PUBLISHED", ...input })
        .where(draft(id, expectedUpdatedAt))
        .returning({ id: contentBlocks.id });
      return rows.length === 1;
    },
    async deleteDraft(id, expectedUpdatedAt) {
      const rows = await client.delete(contentBlocks).where(draft(id, expectedUpdatedAt)).returning({ id: contentBlocks.id });
      return rows.length === 1;
    },
    async updatedAt(id) {
      return one(await client.select({ updatedAt: contentBlocks.updatedAt }).from(contentBlocks).where(eq(contentBlocks.id, id)).limit(1), "Content block")
        .updatedAt;
    },
  };
}
