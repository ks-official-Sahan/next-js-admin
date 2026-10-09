import { and, desc, eq, sql } from "drizzle-orm";

import { chatMessages, chatSessions, chatTrainingEntries, inquiries } from "@/lib/db/schema";

import type { ChatRepo, ChatTrainingRepo } from "../chat";
import { first, one, type DbClient } from "./client";

export function chatRepo(client: DbClient): ChatRepo {
  return {
    async upsertSession(input) {
      // Nothing changes for an existing session; it is only returned.
      const created = await client.insert(chatSessions).values(input).onConflictDoNothing({ target: chatSessions.sessionId }).returning();
      if (created[0]) return created[0];
      return one(await client.select().from(chatSessions).where(eq(chatSessions.sessionId, input.sessionId)).limit(1), "Chat session");
    },
    async addMessage(input) {
      // The count bump and the insert are independent: one round trip of latency, not two.
      const [, rows] = await Promise.all([
        client
          .update(chatSessions)
          .set({ messagesCount: sql`${chatSessions.messagesCount} + 1` })
          .where(eq(chatSessions.sessionId, input.sessionId)),
        client.insert(chatMessages).values(input).returning(),
      ]);
      return one(rows, "Chat message");
    },
    async recentMessages(sessionId, limit) {
      const rows = await client
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit);
      return rows.reverse();
    },
    async linkInquiry(sessionId, inquiryId) {
      await client.update(chatSessions).set({ inquiryId, capturedLead: true }).where(eq(chatSessions.sessionId, sessionId));
    },
    listSessions({ limit, offset }) {
      return client
        .select({
          id: chatSessions.id,
          sessionId: chatSessions.sessionId,
          messagesCount: chatSessions.messagesCount,
          createdAt: chatSessions.createdAt,
          capturedLead: chatSessions.capturedLead,
          inquiry: { id: inquiries.id, email: inquiries.email, status: inquiries.status },
        })
        .from(chatSessions)
        .leftJoin(inquiries, eq(inquiries.id, chatSessions.inquiryId))
        .orderBy(desc(chatSessions.createdAt))
        .limit(limit)
        .offset(offset);
    },
  };
}

export function chatTrainingRepo(client: DbClient): ChatTrainingRepo {
  return {
    list({ active, category, limit, offset }) {
      return client
        .select()
        .from(chatTrainingEntries)
        .where(
          and(
            active !== undefined ? eq(chatTrainingEntries.isActive, active) : undefined,
            category ? eq(chatTrainingEntries.category, category) : undefined
          )
        )
        .orderBy(desc(chatTrainingEntries.priority), desc(chatTrainingEntries.createdAt))
        .limit(limit)
        .offset(offset);
    },
    listActive(limit) {
      return client
        .select({ question: chatTrainingEntries.question, answer: chatTrainingEntries.answer })
        .from(chatTrainingEntries)
        .where(eq(chatTrainingEntries.isActive, true))
        .orderBy(desc(chatTrainingEntries.priority))
        .limit(limit);
    },
    async find(id) {
      return first(await client.select().from(chatTrainingEntries).where(eq(chatTrainingEntries.id, id)).limit(1));
    },
    async create(input) {
      return one(await client.insert(chatTrainingEntries).values(input).returning(), "Training entry");
    },
    async update(id, input) {
      return one(await client.update(chatTrainingEntries).set(input).where(eq(chatTrainingEntries.id, id)).returning(), "Training entry");
    },
    async delete(id) {
      await client.delete(chatTrainingEntries).where(eq(chatTrainingEntries.id, id));
    },
  };
}
