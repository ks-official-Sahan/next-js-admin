import { Metadata } from "next";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { requirePermission } from "@/lib/auth/dal";
import { getServerQueryClient } from "@/lib/cache/query-client.server";
import { queryKeys } from "@/lib/cache/query-keys";
import { listSessionSummaries } from "@/lib/chatbot/session";
import { CHAT_SESSIONS_PAGE_SIZE } from "@/lib/chatbot/session-summaries";
import ConversationsClient from "@/components/admin/chatbot/ConversationsClient";

export const metadata: Metadata = {
  title: "Conversations",
  robots: "noindex, nofollow, nocache",
};

export default async function ConversationsPage() {
  await requirePermission("viewChatHistory");

  // First page rendered from the server; the client then polls for new chats.
  const params = { limit: CHAT_SESSIONS_PAGE_SIZE, offset: 0 };
  const queryClient = getServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.admin.chatbotSessions.list(params),
    queryFn: () => listSessionSummaries(params),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conversation History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent chat sessions from visitors. Click a session to view the full conversation.
        </p>
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ConversationsClient />
      </HydrationBoundary>
    </div>
  );
}
