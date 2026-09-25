import "server-only";

import { db } from "@/lib/db/prisma";
import type { ChatTrainingEntry } from "@prisma/client";

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
}): Promise<ChatTrainingEntry[]> {
  const where: Record<string, unknown> = {};
  if (options?.active !== undefined) where.isActive = options.active;
  if (options?.category) where.category = options.category;

  return db.chatTrainingEntry.findMany({
    where,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}
