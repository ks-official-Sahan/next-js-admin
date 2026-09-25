"use client";

import { useState } from "react";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import {
  changePassword,
  confirmMfaDisable,
  confirmMfaEnable,
  requestEmailChangeAction,
  revokeMySession,
  revokeOtherSessions,
  startMfaDisable,
  startMfaEnable,
  updateProfile,
} from "@/lib/actions/account";
import type { ActionState } from "@/lib/actions/state";

export function ProfileForm({ name, bio }: { name: string; bio: string }) {
  return (
    <ActionForm action={updateProfile} className="space-y-4">
      <Field label="Name" name="name" defaultValue={name} autoComplete="name" required maxLength={80} />
      <Field label="Bio" name="bio" defaultValue={bio} multiline maxLength={500} hint="Shown on posts you write. Optional." />
      <SubmitButton pendingLabel="Saving...">Save profile</SubmitButton>
    </ActionForm>
  );
}

export function PasswordForm({ email, forced }: { email: string; forced: boolean }) {
  return (
    <ActionForm action={changePassword} className="space-y-4">
      <input type="text" name="username" value={email} autoComplete="username" readOnly hidden />
      <Field
        label={forced ? "Password you were given" : "Current password"}
        name="current"
        type="password"
        autoComplete="current-password"
        required
        maxLength={128}
      />
      <Field
        label="New password"
        name="next"
        type="password"
        autoComplete="new-password"
        required
        maxLength={128}
        hint="At least 12 characters, mixing three of: lower case, upper case, digits, symbols."
      />
      <Field label="Repeat the new password" name="confirm" type="password" autoComplete="new-password" required maxLength={128} />
      <SubmitButton pendingLabel="Changing...">Change password</SubmitButton>
    </ActionForm>
  );
}

export function EmailChangeForm({ email }: { email: string }) {
  return (
    <ActionForm action={requestEmailChangeAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Current address: <span className="font-medium text-foreground">{email}</span>
      </p>
      <Field label="New email" name="newEmail" type="email" autoComplete="email" required maxLength={254} />
      <Field
        label="Current password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        maxLength={128}
        hint="We email a confirmation link to the new address; nothing changes until you open it."
      />
      <SubmitButton pendingLabel="Sending...">Send confirmation link</SubmitButton>
    </ActionForm>
  );
}

type Step = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Turning the second factor on or off. Step one asks for the password and emails
 * a code; step two takes the code. The parent gives this a key that changes with
 * the saved state, so it starts fresh after a successful change.
 */
export function MfaFlow({ enabled, email }: { enabled: boolean; email: string }) {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const start: Step = enabled ? startMfaDisable : startMfaEnable;
  const confirm: Step = enabled ? confirmMfaDisable : confirmMfaEnable;

  if (!challengeId) {
    return (
      <ActionForm
        className="space-y-4"
        action={start}
        onResult={(result) => {
          if (result.ok && result.challengeId) setChallengeId(result.challengeId);
        }}
      >
        <Field label="Your password" name="password" type="password" autoComplete="current-password" required maxLength={128} />
        <SubmitButton variant={enabled ? "danger" : "primary"} pendingLabel="Sending code...">
          {enabled ? "Email me a code to turn it off" : "Email me a code to turn it on"}
        </SubmitButton>
      </ActionForm>
    );
  }

  return (
    <ActionForm action={confirm} className="space-y-4">
      <input type="hidden" name="challengeId" value={challengeId} />
      <p className="text-sm text-muted-foreground">
        We sent a 6 digit code to <span className="font-medium text-foreground">{email}</span>.
      </p>
      <Field
        label="6 digit code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        maxLength={10}
        autoFocus
      />
      <div className="flex items-center gap-3">
        <SubmitButton variant={enabled ? "danger" : "primary"} pendingLabel="Checking...">
          {enabled ? "Turn off two-factor" : "Turn on two-factor"}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setChallengeId(null)}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Start over
        </button>
      </div>
    </ActionForm>
  );
}

export function EndSessionButton({ sessionId }: { sessionId: string }) {
  return (
    <ActionForm action={revokeMySession} showMessage={false}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <SubmitButton variant="smallDanger" pendingLabel="Ending...">
        Sign out
      </SubmitButton>
    </ActionForm>
  );
}

export function EndOtherSessionsButton() {
  return (
    <ActionForm action={revokeOtherSessions} showMessage={false}>
      <SubmitButton variant="smallDanger" pendingLabel="Ending...">
        Sign out all other sessions
      </SubmitButton>
    </ActionForm>
  );
}
