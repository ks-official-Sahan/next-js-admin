"use client";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import { updateEmailRoutingAction } from "@/lib/actions/settings";
import type { EmailRouting } from "@/lib/settings/schema";

export default function EmailRoutingForm({ value }: { value: EmailRouting }) {
  return (
    <ActionForm action={updateEmailRoutingAction} className="space-y-4">
      <Field label="Inbox email (optional override)" name="inboxEmail" type="email" defaultValue={value.inboxEmail} />
      <Field
        label="Notification email (optional override)"
        name="notificationEmail"
        type="email"
        defaultValue={value.notificationEmail}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="autoReplyEnabled"
          defaultChecked={value.autoReplyEnabled}
          className="size-4 rounded border-input"
        />
        Send an automatic reply to contact form submissions
      </label>
      <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
    </ActionForm>
  );
}
