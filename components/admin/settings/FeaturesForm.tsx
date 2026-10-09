"use client";

import ActionForm, { SubmitButton } from "@/components/admin/ui/ActionForm";
import { updateFeaturesAction } from "@/lib/actions/settings";
import type { Features } from "@/lib/settings/schema";

/** `canToggleChatbot`: switching the bot needs manageChatbotTraining; the action ignores the box without it. */
export default function FeaturesForm({ value, canToggleChatbot }: { value: Features; canToggleChatbot: boolean }) {
  return (
    <ActionForm action={updateFeaturesAction} className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="chatbotEnabled"
          defaultChecked={value.chatbotEnabled}
          disabled={!canToggleChatbot}
          className="size-4 rounded border-input"
        />
        Show the chatbot widget on the public site
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="readMoreEnabled"
          defaultChecked={value.readMoreEnabled}
          className="size-4 rounded border-input"
        />
        Enable &quot;read more&quot; expansion on long content
      </label>
      <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
    </ActionForm>
  );
}
