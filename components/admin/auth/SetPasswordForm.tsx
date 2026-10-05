"use client";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import { PasswordField } from "@/components/admin/ui/PasswordField";
import { setPasswordAction } from "@/lib/actions/set-password";

export default function SetPasswordForm({
  token,
  email,
  askName,
}: {
  token: string;
  email: string;
  askName: boolean;
}) {
  return (
    <ActionForm action={setPasswordAction} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />
      {/* Lets a password manager file the new password under the right account. */}
      <input type="text" name="username" value={email} autoComplete="username" readOnly hidden />
      {askName ? <Field label="Your name" name="name" autoComplete="name" maxLength={80} /> : null}
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        required
        maxLength={128}
        autoFocus
        hint="At least 12 characters, mixing three of: lower case, upper case, digits, symbols."
      />
      <PasswordField label="Repeat the password" name="confirm" autoComplete="new-password" required maxLength={128} />
      <SubmitButton className="w-full" pendingLabel="Saving...">
        Save password
      </SubmitButton>
    </ActionForm>
  );
}
