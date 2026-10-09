import { and, desc, eq, getTableColumns, gte, ilike, or } from "drizzle-orm";

import { inquiries, inquiryEmailEvents, users } from "@/lib/db/schema";

import type { InquiryRepo } from "../inquiries";
import { containsPattern, countRows, first, one, type DbClient } from "./client";

const withAssignee = { ...getTableColumns(inquiries), assignee: { id: users.id, name: users.name, email: users.email } };

export function inquiryRepo(client: DbClient): InquiryRepo {
  const listed = () => client.select(withAssignee).from(inquiries).leftJoin(users, eq(users.id, inquiries.assigneeId));
  return {
    async create(input) {
      return one(await client.insert(inquiries).values(input).returning(), "Inquiry");
    },
    async findRecentDuplicate({ email, message, ipHash, since }) {
      return first(
        await client
          .select()
          .from(inquiries)
          .where(and(eq(inquiries.email, email), eq(inquiries.message, message), eq(inquiries.ipHash, ipHash), gte(inquiries.createdAt, since)))
          .limit(1)
      );
    },
    async findById(id) {
      return first(await client.select().from(inquiries).where(eq(inquiries.id, id)).limit(1));
    },
    async findDetail(id) {
      const [row, events] = await Promise.all([
        listed().where(eq(inquiries.id, id)).limit(1).then(first),
        client.select().from(inquiryEmailEvents).where(eq(inquiryEmailEvents.inquiryId, id)).orderBy(desc(inquiryEmailEvents.createdAt)),
      ]);
      return row && { ...row, events };
    },
    async list({ status, search, limit, offset }) {
      const where = and(
        status ? eq(inquiries.status, status) : undefined,
        search
          ? or(
              ilike(inquiries.name, containsPattern(search)),
              ilike(inquiries.email, containsPattern(search)),
              ilike(inquiries.message, containsPattern(search))
            )
          : undefined
      );
      const [rows, total] = await Promise.all([
        listed().where(where).orderBy(desc(inquiries.createdAt)).limit(limit).offset(offset),
        countRows(client, inquiries, where),
      ]);
      return { rows, total };
    },
    listRecent(limit) {
      return listed().orderBy(desc(inquiries.createdAt)).limit(limit);
    },
    async update(id, patch) {
      return one(await client.update(inquiries).set(patch).where(eq(inquiries.id, id)).returning(), "Inquiry");
    },
    async delete(id) {
      await client.delete(inquiries).where(eq(inquiries.id, id));
    },
    async addEmailEvent(input) {
      await client.insert(inquiryEmailEvents).values(input);
    },
  };
}
