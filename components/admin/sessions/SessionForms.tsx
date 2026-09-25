"use client";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import { forceLogoutEveryone, forceLogoutUser, revokeSessionAction } from "@/lib/actions/sessions";

export function RevokeSessionForm({ sessionId }: { sessionId: string }) {
  return (
    <ActionForm action={revokeSessionAction} showMessage={false}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <SubmitButton variant="smallDanger" pendingLabel="Ending...">
        End session
      </SubmitButton>
    </ActionForm>
  );
}

export function ForceLogoutUserForm({ userId, email }: { userId: string; email: string }) {
  return (
    <details>
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-md border border-destructive/40 px-3 text-xs text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        Sign out everywhere
      </summary>
      <ActionForm action={forceLogoutUser} showMessage={false} className="mt-3 w-64 space-y-3 rounded-md border border-border bg-background p-3">
        <input type="hidden" name="userId" value={userId} />
        <Field label="Reason (optional)" name="reason" maxLength={200} className="text-xs" hint={`Sent to ${email}.`} />
        <SubmitButton variant="smallDanger" pendingLabel="Signing out...">
          Sign this user out
        </SubmitButton>
      </ActionForm>
    </details>
  );
}

export function ForceLogoutEveryoneForm() {
  return (
    <ActionForm action={forceLogoutEveryone} className="space-y-3">
      <Field label="Reason (optional)" name="reason" maxLength={200} hint="Sent to every user who is signed out." />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="includeMine" className="mt-0.5 size-4 accent-primary" />
        <span>Sign me out too. Leave this off to keep your own sessions.</span>
      </label>
      <SubmitButton variant="danger" pendingLabel="Signing out...">
        Sign everyone out
      </SubmitButton>
    </ActionForm>
  );
}
