import { Metadata } from "next";
import Link from "next/link";

import { requirePermission } from "@/lib/auth/dal";
import { buttonVariants, cardClass } from "@/components/admin/ui/styles";

export const metadata: Metadata = {
  title: "Chatbot",
  robots: "noindex, nofollow, nocache",
};

export default async function ChatbotDashboard() {
  // Check permission for viewing chat history
  await requirePermission("viewChatHistory");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chatbot Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage conversations and training data for the chatbot.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 s768:grid-cols-2">
        <section className={cardClass} aria-labelledby="conversations-heading">
          <h2 id="conversations-heading" className="text-base font-medium">
            Conversation History
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">View and manage chat sessions from visitors.</p>
          <Link href="/admin/chatbot/conversations" className={buttonVariants.primary}>
            View Conversations
          </Link>
        </section>

        <section className={cardClass} aria-labelledby="training-heading">
          <h2 id="training-heading" className="text-base font-medium">
            Training Data
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Create and manage FAQ entries and training examples.
          </p>
          <Link href="/admin/chatbot/training" className={buttonVariants.primary}>
            Manage Training Data
          </Link>
        </section>
      </div>
    </div>
  );
}
