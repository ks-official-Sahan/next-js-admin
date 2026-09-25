"use client";

import Link from "next/link";
import { useState } from "react";

import EmptyState from "@/components/admin/ui/EmptyState";
import { badgeClass, buttonVariants, tableClass, tdClass, thClass } from "@/components/admin/ui/styles";
import { useAdminChatbotSessions } from "@/lib/admin/hooks/use-chatbot-sessions";
import { CHAT_SESSIONS_PAGE_SIZE } from "@/lib/chatbot/session-summaries";
import { cn } from "@/lib/utils";

export default function ConversationsClient() {
  const [offset, setOffset] = useState(0);
  const { data: sessions = [], isFetching, isError } = useAdminChatbotSessions({ limit: CHAT_SESSIONS_PAGE_SIZE, offset });

  if (!isFetching && !isError && sessions.length === 0 && offset === 0) {
    return <EmptyState title="No conversations yet" description="Visitor chats will appear here once someone uses the chatbot." />;
  }

  return (
    <div className="space-y-4">
      {isError ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          Could not refresh conversations. Showing the last loaded list.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border" aria-busy={isFetching}>
        <table className={cn(tableClass, isFetching && "opacity-80 transition-opacity")}>
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th scope="col" className={thClass}>
                Session ID
              </th>
              <th scope="col" className={thClass}>
                Messages
              </th>
              <th scope="col" className={thClass}>
                Lead Captured
              </th>
              <th scope="col" className={thClass}>
                Contact
              </th>
              <th scope="col" className={thClass}>
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sessions.map((session) => (
              <tr key={session.id} className="hover:bg-muted/40">
                <td className={tdClass}>
                  <Link
                    href={`/admin/chatbot/conversations/${session.sessionId}`}
                    className="font-mono text-sm text-primary hover:underline"
                  >
                    {session.sessionId.slice(0, 8)}...
                  </Link>
                </td>
                <td className={tdClass}>{session.messagesCount}</td>
                <td className={tdClass}>
                  {session.capturedLead ? (
                    <span className={badgeClass}>Yes</span>
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </td>
                <td className={tdClass}>{session.inquiry?.email || "-"}</td>
                <td className={`${tdClass} text-muted-foreground`}>{new Date(session.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {offset > 0 || sessions.length === CHAT_SESSIONS_PAGE_SIZE ? (
        <nav aria-label="Pagination" className="flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - CHAT_SESSIONS_PAGE_SIZE))}
            disabled={offset === 0}
            className={buttonVariants.small}
          >
            Newer
          </button>
          <button
            type="button"
            onClick={() => setOffset(offset + CHAT_SESSIONS_PAGE_SIZE)}
            disabled={sessions.length < CHAT_SESSIONS_PAGE_SIZE}
            className={buttonVariants.small}
          >
            Older
          </button>
        </nav>
      ) : null}
    </div>
  );
}
