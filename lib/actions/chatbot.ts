"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { authorizeAction } from "@/lib/actions/guard";
import { done, fail, fieldErrorsFrom, formValues, type ActionState } from "@/lib/actions/state";
import { audit } from "@/lib/admin/audit";
import { invalidate } from "@/lib/cache/invalidate";
import { forTraining } from "@/lib/cache/plan";
import { db } from "@/lib/db/prisma";
import { log } from "@/lib/log";

// Chatbot training data CRUD. Every mutation goes through authorizeAction()
// (not requirePermission directly) so the mustChangePassword gate applies the
// same way it does for every other admin form action, and mutate + audit run
// in one db.$transaction, matching lib/actions/works.ts and lib/actions/blog.ts.

const TRAINING_PATH = "/admin/chatbot/training";
const UNEXPECTED = "Something went wrong. Please try again.";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const trainingFormSchema = z.object({
  category: z.string().trim().min(1, "Category is required.").max(100),
  question: z.string().trim().min(5, "Use at least 5 characters.").max(2000),
  answer: z.string().trim().min(5, "Use at least 5 characters.").max(5000),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  isActive: z
    .string()
    .optional()
    .transform((value) => value === "on" || value === "true"),
});

/** Create a training entry for the chatbot. */
export async function createTrainingEntry(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("manageChatbot");
  if (!auth.ok) return fail(auth.error);

  const parsed = trainingFormSchema.safeParse(formValues(formData));
  if (!parsed.success) return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));

  try {
    await db.$transaction(async (tx) => {
      const entry = await tx.chatTrainingEntry.create({
        data: {
          category: parsed.data.category,
          question: parsed.data.question,
          answer: parsed.data.answer,
          priority: parsed.data.priority,
          isActive: parsed.data.isActive,
          createdById: auth.user.id,
        },
      });

      await audit(
        {
          action: "chatbot.training.created",
          actor: auth.user,
          entityType: "ChatTrainingEntry",
          entityId: entry.id,
          after: entry,
        },
        tx
      );
    });

    invalidate(forTraining());
    revalidatePath(TRAINING_PATH);
    return done("Training entry created.");
  } catch (error) {
    log.error("create training entry failed", { error: errorMessage(error) });
    return fail(UNEXPECTED);
  }
}

/** Update a training entry. */
export async function updateTrainingEntry(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("manageChatbot");
  if (!auth.ok) return fail(auth.error);

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Training entry ID is required.");

  const parsed = trainingFormSchema.safeParse(formValues(formData));
  if (!parsed.success) return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));

  try {
    const before = await db.chatTrainingEntry.findUnique({ where: { id } });
    if (!before) return fail("Training entry not found.");

    await db.$transaction(async (tx) => {
      const entry = await tx.chatTrainingEntry.update({
        where: { id },
        data: {
          category: parsed.data.category,
          question: parsed.data.question,
          answer: parsed.data.answer,
          priority: parsed.data.priority,
          isActive: parsed.data.isActive,
        },
      });

      await audit(
        {
          action: "chatbot.training.updated",
          actor: auth.user,
          entityType: "ChatTrainingEntry",
          entityId: id,
          before,
          after: entry,
        },
        tx
      );
    });

    invalidate(forTraining());
    revalidatePath(TRAINING_PATH);
    return done("Training entry updated.");
  } catch (error) {
    log.error("update training entry failed", { error: errorMessage(error) });
    return fail(UNEXPECTED);
  }
}

/** Delete a training entry. */
export async function deleteTrainingEntry(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("manageChatbot");
  if (!auth.ok) return fail(auth.error);

  const id = String(formData.get("id") ?? "");
  if (!id) return fail("Training entry ID is required.");

  try {
    const before = await db.chatTrainingEntry.findUnique({ where: { id } });
    if (!before) return fail("Training entry not found.");

    await db.$transaction(async (tx) => {
      await tx.chatTrainingEntry.delete({ where: { id } });

      await audit(
        {
          action: "chatbot.training.deleted",
          actor: auth.user,
          entityType: "ChatTrainingEntry",
          entityId: id,
          before,
        },
        tx
      );
    });

    invalidate(forTraining());
    revalidatePath(TRAINING_PATH);
    return done("Training entry deleted.");
  } catch (error) {
    log.error("delete training entry failed", { error: errorMessage(error) });
    return fail(UNEXPECTED);
  }
}
