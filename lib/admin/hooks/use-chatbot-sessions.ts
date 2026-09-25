"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { ChatSessionSummary } from "@/lib/chatbot/session-summaries";
import { queryKeys, type ChatbotSessionListParams } from "@/lib/cache/query-keys";

import { fetchAdminJson } from "./fetch-json";

/** New conversations arrive while the page is open; poll only while the tab is visible. */
const POLL_MS = 30_000;

export function useAdminChatbotSessions(params: ChatbotSessionListParams) {
  return useQuery({
    queryKey: queryKeys.admin.chatbotSessions.list(params),
    queryFn: ({ signal }) =>
      fetchAdminJson<ChatSessionSummary[]>(
        `/api/admin/chatbot/sessions?limit=${params.limit}&offset=${params.offset}`,
        signal
      ),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
}
