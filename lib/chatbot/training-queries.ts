import "server-only";

import { repos } from "@/lib/data";
import type { ChatTrainingRow } from "@/lib/data/chat";

// Read-only queries for the chatbot training screen. Kept out of
// lib/actions/chatbot.ts ("use server") so this can't be invoked as a public
// Server Action endpoint — the caller (the admin training list page) already
// calls requirePermission("manageChatbot") before reaching here.

/** Get all training entries with optional filtering. */
export async function listTrainingEntries(options?: {
  active?: boolean;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<ChatTrainingRow[]> {
  return repos.chatTraining.list({
    active: options?.active,
    category: options?.category,
    limit: options?.limit ?? 50,
    offset: options?.offset ?? 0,
  });
}
