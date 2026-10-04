import type { Prisma } from "@prisma/client";

import type { InquiryRepo } from "../inquiries";
import type { DbClient } from "./client";

const assignee = { select: { id: true, name: true, email: true } } as const;

export function inquiryRepo(client: DbClient): InquiryRepo {
  return {
    create(input) {
      return client.inquiry.create({ data: input });
    },
    findRecentDuplicate({ email, message, ipHash, since }) {
      return client.inquiry.findFirst({ where: { email, message, ipHash, createdAt: { gte: since } } });
    },
    findById(id) {
      return client.inquiry.findUnique({ where: { id } });
    },
    findDetail(id) {
      return client.inquiry.findUnique({
        where: { id },
        include: { assignee, events: { orderBy: { createdAt: "desc" } } },
      });
    },
    async list({ status, search, limit, offset }) {
      const where: Prisma.InquiryWhereInput = {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { message: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        client.inquiry.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset, include: { assignee } }),
        client.inquiry.count({ where }),
      ]);
      return { rows, total };
    },
    listRecent(limit) {
      return client.inquiry.findMany({ orderBy: { createdAt: "desc" }, take: limit, include: { assignee } });
    },
    update(id, patch) {
      return client.inquiry.update({ where: { id }, data: patch });
    },
    async delete(id) {
      await client.inquiry.delete({ where: { id } });
    },
    async addEmailEvent(input) {
      await client.inquiryEmailEvent.create({ data: input });
    },
  };
}
