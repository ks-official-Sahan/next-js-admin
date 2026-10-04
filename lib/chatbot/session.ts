import "server-only";

import type { ChatMessageInput, ChatSessionInput, ChatStore } from "@sahan-sac/chat-kit/adapter";
import type { ChatSessionSummary } from "@sahan-sac/chat-kit/session-summaries";

import { repos } from "@/lib/data";
import type { ChatMessageRow, ChatSessionRow } from "@/lib/data/chat";

// Session management for chat: create sessions, add messages, track lead
// capture. prismaChatStore at the bottom is the @sahan-sac/chat-kit ChatStore
// the chat route uses; it goes through the chat repository.

export type CreateSessionInput = ChatSessionInput;
export type AddMessageInput = ChatMessageInput;

export async function upsertSession(input: CreateSessionInput): Promise<ChatSessionRow> {
  return repos.chat.upsertSession({
    sessionId: input.sessionId,
    ipHash: input.ipHash || null,
    userAgent: input.userAgent || null,
    pagePath: input.pagePath || null,
  });
}

export async function addMessage(input: AddMessageInput): Promise<ChatMessageRow> {
  return repos.chat.addMessage({
    sessionId: input.sessionId,
    role: input.role,
    content: input.content,
    tokens: input.tokens || null,
    latencyMs: input.latencyMs || null,
  });
}

/** The last `limit` messages, oldest first. */
export async function getSessionMessages(sessionId: string, limit: number = 10): Promise<ChatMessageRow[]> {
  return repos.chat.recentMessages(sessionId, limit);
}

export async function linkInquiry(sessionId: string, inquiryId: string): Promise<void> {
  await repos.chat.linkInquiry(sessionId, inquiryId);
}

/** One page of the admin conversations list, newest first, in a single query with no message bodies. */
export async function listSessionSummaries(options: { limit: number; offset: number }): Promise<ChatSessionSummary[]> {
  const rows = await repos.chat.listSessions(options);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export const prismaChatStore: ChatStore = {
  upsertSession,
  addMessage,
  getRecentMessages: getSessionMessages,
  linkInquiry,
  listSessionSummaries,
};
