export interface ChatSessionRow {
  id: string;
  /** Client-generated opaque id. */
  sessionId: string;
  ipHash: string | null;
  userAgent: string | null;
  pagePath: string | null;
  inquiryId: string | null;
  messagesCount: number;
  capturedLead: boolean;
  createdAt: Date;
}

export interface ChatMessageRow {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  tokens: number | null;
  latencyMs: number | null;
  createdAt: Date;
}

export interface ChatSessionListRow {
  id: string;
  sessionId: string;
  messagesCount: number;
  capturedLead: boolean;
  createdAt: Date;
  inquiry: { id: string; email: string; status: string } | null;
}

export interface ChatTrainingRow {
  id: string;
  category: string;
  question: string;
  answer: string;
  priority: number;
  isActive: boolean;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ChatTrainingInput = Pick<ChatTrainingRow, "category" | "question" | "answer" | "priority" | "isActive">;

export interface ChatRepo {
  /** Creates the session on first use; returns the existing one otherwise. */
  upsertSession(input: { sessionId: string; ipHash: string | null; userAgent: string | null; pagePath: string | null }): Promise<ChatSessionRow>;
  /** Stores one message and bumps the session's message count. */
  addMessage(input: Pick<ChatMessageRow, "sessionId" | "role" | "content" | "tokens" | "latencyMs">): Promise<ChatMessageRow>;
  /** The last `limit` messages, oldest first. */
  recentMessages(sessionId: string, limit: number): Promise<ChatMessageRow[]>;
  linkInquiry(sessionId: string, inquiryId: string): Promise<void>;
  /** Newest first, no message bodies. */
  listSessions(options: { limit: number; offset: number }): Promise<ChatSessionListRow[]>;
}

export interface ChatTrainingRepo {
  /** Highest priority first, then newest. */
  list(options: { active?: boolean; category?: string; limit: number; offset: number }): Promise<ChatTrainingRow[]>;
  /** Active entries for the chatbot's knowledge, highest priority first. */
  listActive(limit: number): Promise<Pick<ChatTrainingRow, "question" | "answer">[]>;
  find(id: string): Promise<ChatTrainingRow | null>;
  create(input: ChatTrainingInput & { createdById: string }): Promise<ChatTrainingRow>;
  update(id: string, input: ChatTrainingInput): Promise<ChatTrainingRow>;
  delete(id: string): Promise<void>;
}
