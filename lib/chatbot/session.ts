import "server-only";

import { db } from "@/lib/db/prisma";
import type { ChatSession, ChatMessage } from "@prisma/client";

import type { ChatSessionSummary } from "./session-summaries";

// Session management for chat: create/read sessions, add messages, track lead capture.

export interface CreateSessionInput {
  sessionId: string; // UUID from client
  ipHash?: string;
  userAgent?: string;
  pagePath?: string;
}

export interface AddMessageInput {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  tokens?: number;
  latencyMs?: number;
}

export interface SessionWithMessages extends ChatSession {
  messages: ChatMessage[];
}

export async function upsertSession(input: CreateSessionInput): Promise<ChatSession> {
  return db.chatSession.upsert({
    where: { sessionId: input.sessionId },
    update: {}, // No changes on update, just return existing
    create: {
      sessionId: input.sessionId,
      ipHash: input.ipHash || null,
      userAgent: input.userAgent || null,
      pagePath: input.pagePath || null,
    },
  });
}

export async function addMessage(input: AddMessageInput): Promise<ChatMessage> {
  // The count bump and the insert are independent: one round trip of latency, not two.
  const [, message] = await Promise.all([
    db.chatSession.update({
      where: { sessionId: input.sessionId },
      data: { messagesCount: { increment: 1 } },
    }),
    db.chatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        tokens: input.tokens || null,
        latencyMs: input.latencyMs || null,
      },
    }),
  ]);
  return message;
}

export async function getSession(sessionId: string): Promise<SessionWithMessages | null> {
  return db.chatSession.findUnique({
    where: { sessionId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getSessionMessages(
  sessionId: string,
  limit: number = 10
): Promise<ChatMessage[]> {
  const session = await db.chatSession.findUnique({
    where: { sessionId },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: limit,
      },
    },
  });

  if (!session) return [];
  return session.messages.reverse(); // Restore chronological order
}

export async function linkInquiry(sessionId: string, inquiryId: string): Promise<ChatSession> {
  return db.chatSession.update({
    where: { sessionId },
    data: {
      inquiryId,
      capturedLead: true,
    },
  });
}

/** One page of the admin conversations list, newest first, in a single query with no message bodies. */
export async function listSessionSummaries(options: { limit: number; offset: number }): Promise<ChatSessionSummary[]> {
  const rows = await db.chatSession.findMany({
    select: {
      id: true,
      sessionId: true,
      messagesCount: true,
      createdAt: true,
      capturedLead: true,
      inquiry: { select: { id: true, email: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: options.limit,
    skip: options.offset,
  });
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
