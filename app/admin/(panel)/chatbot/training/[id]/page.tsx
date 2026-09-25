import { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/dal";
import { deleteTrainingEntry, updateTrainingEntry } from "@/lib/actions/chatbot";
import type { ActionState } from "@/lib/actions/state";
import { db } from "@/lib/db/prisma";
import ActionForm, { SubmitButton } from "@/components/admin/ui/ActionForm";
import { buttonVariants, cardClass } from "@/components/admin/ui/styles";
import TrainingEntryForm from "@/components/admin/chatbot/TrainingEntryForm";

export const metadata: Metadata = {
  title: "Edit Training Entry",
  robots: "noindex, nofollow, nocache",
};

export default async function EditTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("manageChatbot");

  const entry = await db.chatTrainingEntry.findUnique({ where: { id } });
  if (!entry) notFound();

  async function update(previous: ActionState, formData: FormData): Promise<ActionState> {
    "use server";
    const result = await updateTrainingEntry(previous, formData);
    if (result.ok) redirect("/admin/chatbot/training");
    return result;
  }

  async function remove(previous: ActionState, formData: FormData): Promise<ActionState> {
    "use server";
    const result = await deleteTrainingEntry(previous, formData);
    if (result.ok) redirect("/admin/chatbot/training");
    return result;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit Training Entry</h1>
          <p className="mt-1 text-sm text-muted-foreground">Update this FAQ or training example for the chatbot.</p>
        </div>
        <Link href="/admin/chatbot/training" className={buttonVariants.secondary}>
          Back to Training
        </Link>
      </div>

      <div className={cardClass}>
        <TrainingEntryForm
          action={update}
          submitLabel="Save Changes"
          initial={{
            id: entry.id,
            category: entry.category,
            question: entry.question,
            answer: entry.answer,
            priority: entry.priority,
            isActive: entry.isActive,
          }}
        />
      </div>

      <ActionForm action={remove} className="border-t border-border pt-6">
        <input type="hidden" name="id" value={entry.id} />
        <SubmitButton variant="danger" pendingLabel="Deleting…">
          Delete Entry
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
