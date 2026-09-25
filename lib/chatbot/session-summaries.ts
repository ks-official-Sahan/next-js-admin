// The conversations list row (admin), shared by the server page, the
// /api/admin/chatbot/sessions route and the client list. Only what the table
// shows: never message bodies — `messagesCount` is kept denormalized on the
// session row for exactly this.

export interface ChatSessionSummary {
  id: string;
  sessionId: string;
  messagesCount: number;
  createdAt: string;
  capturedLead: boolean;
  inquiry: { id: string; email: string; status: string } | null;
}

export const CHAT_SESSIONS_PAGE_SIZE = 50;
export const CHAT_SESSIONS_MAX_LIMIT = 100;

/** Clamps untrusted limit/offset query values to a safe window. */
export function parseChatSessionListParams(source: { get(name: string): string | null }): { limit: number; offset: number } {
  const limit = Number.parseInt(source.get("limit") ?? "", 10);
  const offset = Number.parseInt(source.get("offset") ?? "", 10);
  return {
    limit: Number.isInteger(limit) ? Math.min(CHAT_SESSIONS_MAX_LIMIT, Math.max(1, limit)) : CHAT_SESSIONS_PAGE_SIZE,
    offset: Number.isInteger(offset) ? Math.min(100_000, Math.max(0, offset)) : 0,
  };
}
