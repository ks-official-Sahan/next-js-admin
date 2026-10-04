import type { Prisma } from "@prisma/client";

import type { BlockStatus, ContentBlockRepo, ContentBlockRow } from "../content";
import type { DbClient } from "./client";
import { translateUnique } from "./errors";

const json = (value: unknown) => value as Prisma.InputJsonValue;

const blockSelect = {
  id: true,
  version: true,
  status: true,
  data: true,
  note: true,
  publishedAt: true,
  updatedAt: true,
  createdById: true,
  publishedById: true,
} as const;

export function contentBlockRepo(client: DbClient): ContentBlockRepo {
  return {
    async listSection(page, section) {
      return (await client.contentBlock.findMany({
        where: { pageSlug: page, sectionSlug: section },
        orderBy: { version: "desc" },
        select: blockSelect,
      })) as ContentBlockRow[];
    },
    countSection(page, section) {
      return client.contentBlock.count({ where: { pageSlug: page, sectionSlug: section } });
    },
    async listPageStates(page) {
      return (await client.contentBlock.findMany({
        where: { pageSlug: page, status: { in: ["DRAFT", "PUBLISHED"] } },
        select: { sectionSlug: true, status: true, version: true, publishedAt: true, updatedAt: true },
      })) as Array<{ sectionSlug: string; status: BlockStatus; version: number; publishedAt: Date | null; updatedAt: Date }>;
    },
    async listPageData(page, statuses) {
      return (await client.contentBlock.findMany({
        where: { pageSlug: page, status: { in: statuses } },
        select: { sectionSlug: true, status: true, data: true },
      })) as Array<{ sectionSlug: string; status: BlockStatus; data: unknown }>;
    },
    async lastPublishedUpdate(page) {
      const row = await client.contentBlock.findFirst({
        where: { pageSlug: page, status: "PUBLISHED" },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      });
      return row?.updatedAt ?? null;
    },
    create(input) {
      return translateUnique(() =>
        client.contentBlock.create({ data: { ...input, data: json(input.data) }, select: { version: true, updatedAt: true } })
      );
    },
    async updateDraftData(id, expectedUpdatedAt, data) {
      const { count } = await client.contentBlock.updateMany({
        where: { id, status: "DRAFT", updatedAt: expectedUpdatedAt },
        data: { data: json(data) },
      });
      return count === 1;
    },
    async supersede(id) {
      await client.contentBlock.updateMany({ where: { id, status: "PUBLISHED" }, data: { status: "SUPERSEDED" } });
    },
    async publishDraft(id, expectedUpdatedAt, input) {
      const { count } = await client.contentBlock.updateMany({
        where: { id, status: "DRAFT", updatedAt: expectedUpdatedAt },
        data: { status: "PUBLISHED", ...input },
      });
      return count === 1;
    },
    async deleteDraft(id, expectedUpdatedAt) {
      const { count } = await client.contentBlock.deleteMany({ where: { id, status: "DRAFT", updatedAt: expectedUpdatedAt } });
      return count === 1;
    },
    async updatedAt(id) {
      return (await client.contentBlock.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt;
    },
  };
}
