import type { ChatRepo, ChatTrainingRepo } from "../chat";
import type { DbClient } from "./client";

export function chatRepo(client: DbClient): ChatRepo {
  return {
    upsertSession(input) {
      // Nothing changes for an existing session; the upsert only returns it.
      return client.chatSession.upsert({ where: { sessionId: input.sessionId }, update: {}, create: input });
    },
    async addMessage(input) {
      // The count bump and the insert are independent: one round trip of latency, not two.
      const [, message] = await Promise.all([
        client.chatSession.update({ where: { sessionId: input.sessionId }, data: { messagesCount: { increment: 1 } } }),
        client.chatMessage.create({ data: input }),
      ]);
      return message;
    },
    async recentMessages(sessionId, limit) {
      const rows = await client.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: "desc" }, take: limit });
      return rows.reverse();
    },
    async linkInquiry(sessionId, inquiryId) {
      await client.chatSession.update({ where: { sessionId }, data: { inquiryId, capturedLead: true } });
    },
    listSessions({ limit, offset }) {
      return client.chatSession.findMany({
        select: {
          id: true,
          sessionId: true,
          messagesCount: true,
          createdAt: true,
          capturedLead: true,
          inquiry: { select: { id: true, email: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });
    },
  };
}

export function chatTrainingRepo(client: DbClient): ChatTrainingRepo {
  return {
    list({ active, category, limit, offset }) {
      return client.chatTrainingEntry.findMany({
        where: { ...(active !== undefined ? { isActive: active } : {}), ...(category ? { category } : {}) },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
      });
    },
    listActive(limit) {
      return client.chatTrainingEntry.findMany({
        where: { isActive: true },
        orderBy: { priority: "desc" },
        take: limit,
        select: { question: true, answer: true },
      });
    },
    find(id) {
      return client.chatTrainingEntry.findUnique({ where: { id } });
    },
    create(input) {
      return client.chatTrainingEntry.create({ data: input });
    },
    update(id, input) {
      return client.chatTrainingEntry.update({ where: { id }, data: input });
    },
    async delete(id) {
      await client.chatTrainingEntry.delete({ where: { id } });
    },
  };
}
