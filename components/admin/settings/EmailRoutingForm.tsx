"use client";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import { updateEmailRoutingAction } from "@/lib/actions/settings";
import type { EmailRouting } from "@/lib/settings/schema";

/** `copyRecipients`: how many addresses EMAIL_CC holds (the addresses stay on the server). */
export default function EmailRoutingForm({ value, copyRecipients }: { value: EmailRouting; copyRecipients: number }) {
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
      {/* A disabled box posts nothing; keep the saved choice for when EMAIL_CC is set. */}
      {copyRecipients === 0 && value.authCopyEnabled !== false ? <input type="hidden" name="authCopyEnabled" value="on" /> : null}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="authCopyEnabled"
          defaultChecked={value.authCopyEnabled !== false}
          disabled={copyRecipients === 0}
          aria-describedby="auth-copy-hint"
          className="mt-0.5 size-4 rounded border-input"
        />
        <span>
          Copy account emails (invitations, new accounts, password resets) to EMAIL_CC
          <span id="auth-copy-hint" className="block text-xs text-muted-foreground">
            {copyRecipients === 0
              ? "Set EMAIL_CC to one or more addresses to use this."
              : `Goes to ${copyRecipients} address${copyRecipients === 1 ? "" : "es"}. The copy never includes the link: only the recipient can use it.`}
          </span>
        </span>
      </label>
      <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
    </ActionForm>
  );
}
