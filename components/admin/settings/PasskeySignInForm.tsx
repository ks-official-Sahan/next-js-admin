"use client";

import ActionForm, { SubmitButton } from "@/components/admin/ui/ActionForm";
import { updatePasskeySignInAction } from "@/lib/actions/settings";
import type { PasskeySignInSetting } from "@/lib/settings/schema";

/** The DEVELOPER-only switch for signing in with a passkey alone. */
export default function PasskeySignInForm({ value }: { value: PasskeySignInSetting }) {
  return (
    <ActionForm action={updatePasskeySignInAction} className="space-y-4">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={value.enabled} className="mt-0.5 size-4 rounded border-input" />
        <span>
          Show &quot;Sign in with a passkey&quot; on the sign-in page
          <span className="mt-1 block text-muted-foreground">
            The browser lists the passkeys saved on the device and each person picks their own. The passkey must check a
            fingerprint, face or device PIN, so it replaces both the password and the second step. Accounts without a passkey
            sign in as before.
          </span>
        </span>
      </label>
      <SubmitButton pendingLabel="Saving...">Save</SubmitButton>
    </ActionForm>
  );
}
