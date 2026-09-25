import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/dal";
import { createTrainingEntry } from "@/lib/actions/chatbot";
import type { ActionState } from "@/lib/actions/state";
import { buttonVariants, cardClass } from "@/components/admin/ui/styles";
import TrainingEntryForm from "@/components/admin/chatbot/TrainingEntryForm";

export const metadata: Metadata = {
  title: "New Training Entry",
  robots: "noindex, nofollow, nocache",
};

export default async function NewTrainingPage() {
  await requirePermission("manageChatbot");

  async function create(previous: ActionState, formData: FormData): Promise<ActionState> {
    "use server";
    const result = await createTrainingEntry(previous, formData);
    if (result.ok) redirect("/admin/chatbot/training");
    return result;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Training Entry</h1>
          <p className="mt-1 text-sm text-muted-foreground">Add a new FAQ or training example for the chatbot.</p>
        </div>
        <Link href="/admin/chatbot/training" className={buttonVariants.secondary}>
          Back to Training
        </Link>
      </div>

      <div className={cardClass}>
        <TrainingEntryForm action={create} submitLabel="Create Entry" />
      </div>
    </div>
  );
}
