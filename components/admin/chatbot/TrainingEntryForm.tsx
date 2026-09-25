"use client";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import type { ActionState } from "@/lib/actions/state";

export interface TrainingEntryValues {
  id?: string;
  category?: string;
  question?: string;
  answer?: string;
  priority?: number;
  isActive?: boolean;
}

/** Create/edit form for a chatbot training entry, shared by the new and edit pages. */
export default function TrainingEntryForm({
  action,
  initial,
  submitLabel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: TrainingEntryValues;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="space-y-5">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <Field label="Category" name="category" required maxLength={100} defaultValue={initial?.category ?? "FAQ"} />

      <Field
        label="Question"
        name="question"
        multiline
        required
        maxLength={2000}
        defaultValue={initial?.question}
        placeholder="What is the question visitors might ask?"
        hint="5-2000 characters"
      />

      <Field
        label="Answer"
        name="answer"
        multiline
        required
        maxLength={5000}
        defaultValue={initial?.answer}
        placeholder="Provide the answer the chatbot should give..."
        hint="5-5000 characters"
      />

      <Field
        label="Priority"
        name="priority"
        type="number"
        inputMode="numeric"
        defaultValue={String(initial?.priority ?? 0)}
        hint="0-100. Higher numbers appear first in responses."
      />

      <div className="flex items-center gap-2">
        <input
          id="f-isActive"
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <label htmlFor="f-isActive" className="text-sm font-medium">
          Active
        </label>
      </div>

      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
