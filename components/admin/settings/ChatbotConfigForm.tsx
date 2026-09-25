"use client";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import { fieldClass } from "@/components/admin/ui/styles";
import { updateChatbotConfigAction } from "@/lib/actions/settings";
import type { ChatbotConfig } from "@/lib/settings/schema";
import { cn } from "@/lib/utils";

export default function ChatbotConfigForm({ value }: { value: ChatbotConfig }) {
  return (
    <ActionForm action={updateChatbotConfigAction} className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={value.enabled}
          className="size-4 rounded border-input"
        />
        Chatbot answers messages
      </label>

      <div>
        <label htmlFor="tone" className="text-sm font-medium">
          Tone
        </label>
        <select id="tone" name="tone" defaultValue={value.tone} className={cn(fieldClass, "mt-1.5")}>
          <option value="professional">Professional</option>
          <option value="friendly">Friendly</option>
          <option value="casual">Casual</option>
        </select>
      </div>

      <Field label="Greeting" name="greeting" multiline defaultValue={value.greeting} />

      <p className="text-xs text-muted-foreground">
        Training data version: {value.trainingDataVersion} (managed on the chatbot training screen).
      </p>

      <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
    </ActionForm>
  );
}
