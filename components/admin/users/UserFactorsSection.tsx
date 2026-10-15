"use client";

import { useEffect, useState } from "react";

import ActionForm, { ConfirmSubmitButton, Field } from "@/components/admin/ui/ActionForm";
import type { ActionState } from "@/lib/actions/state";
import { removeUserFactorAction, userFactorsAction, type UserFactorsResult } from "@/lib/actions/user-factors";
import { formatDateTime } from "@/lib/admin/format";

// Another person's sign-in methods, for a developer: loaded when the sheet
// opens (never for the whole user list), and reset with one form that asks for
// the developer's own password.

export default function UserFactorsSection({ userId, email }: { userId: string; email: string }) {
  const [result, setResult] = useState<UserFactorsResult | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    userFactorsAction(userId).then(
      (next) => live && setResult(next),
      () => live && setResult({ ok: false, error: "The sign-in methods could not be loaded." })
    );
    return () => {
      live = false;
    };
  }, [userId, version]);

  if (!result) {
    return (
      <p className="text-sm text-muted-foreground" aria-busy="true">
        Loading sign-in methods...
      </p>
    );
  }
  if (!result.ok) return <p className="text-sm text-destructive">{result.error}</p>;

  const { factors } = result;
  const strong = factors.totp || factors.passkeys.length > 0;
  const choices: { value: string; label: string; detail?: string }[] = [
    ...(factors.totp ? [{ value: "totp", label: "Authenticator app" }] : []),
    ...factors.passkeys.map((passkey) => ({
      value: `passkey:${passkey.id}`,
      label: `Passkey: ${passkey.name}`,
      detail: passkey.lastUsedAt ? `Last used ${formatDateTime(passkey.lastUsedAt)}` : `Added ${formatDateTime(passkey.createdAt)}, never used`,
    })),
    ...(factors.recoveryCodesLeft > 0 ? [{ value: "recovery", label: "Recovery codes", detail: `${factors.recoveryCodesLeft} left` }] : []),
    ...(strong ? [{ value: "all", label: "Everything above" }] : []),
  ];

  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm">
        <li>Emailed codes: {factors.emailCodes ? "on" : "off"}</li>
        <li>Authenticator app: {factors.totp ? "set up" : "none"}</li>
        <li>Passkeys: {factors.passkeys.length}</li>
        <li>Recovery codes left: {factors.recoveryCodesLeft}</li>
      </ul>

      {choices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to remove.</p>
      ) : (
        <ActionForm
          key={version}
          action={removeUserFactorAction}
          className="space-y-3"
          onResult={(state: ActionState) => {
            if (state.ok) setVersion((value) => value + 1);
          }}
        >
          <input type="hidden" name="userId" value={userId} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Remove</legend>
            {choices.map((choice, index) => (
              <label key={choice.value} className="flex items-start gap-2 text-sm">
                <input type="radio" name="target" value={choice.value} defaultChecked={index === 0} className="mt-0.5 size-4" />
                <span>
                  {choice.label}
                  {choice.detail ? <span className="block text-xs text-muted-foreground">{choice.detail}</span> : null}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Removing an app or a passkey signs {email} out everywhere and emails them. Recovery codes go with the last app or passkey.
          </p>
          <Field label="Your password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
          <ConfirmSubmitButton variant="danger" pendingLabel="Removing..." confirmMessage={`Remove the selected sign-in method from ${email}?`}>
            Remove
          </ConfirmSubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
