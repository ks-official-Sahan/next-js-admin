"use client";

import { useActionState } from "react";

import { confirmEmailChangeAction } from "@/lib/actions/confirm-email";
import { idleState } from "@/lib/actions/state";

const primary =
  "inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const link =
  "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// A confirm button, not an auto-fire on page load: a GET request (link
// preview bots, prefetching) must never consume a single-use token by itself.
export default function ConfirmEmailForm({ token, newEmail }: { token: string; newEmail: string }) {
  const [state, action, pending] = useActionState(confirmEmailChangeAction, idleState);

  if (state.ok) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
        <h1 className="text-xl font-semibold tracking-tight">Email confirmed</h1>
        <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
        <a href="/admin/login" className={`${primary} mt-4`}>
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h1 className="text-xl font-semibold tracking-tight">Confirm your new email</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Confirm <span className="font-medium text-foreground">{newEmail}</span> as your new sign-in address.
      </p>
      <form action={action} className="mt-5">
        <input type="hidden" name="token" value={token} />
        {state.error ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Confirming..." : "Confirm this email"}
        </button>
      </form>
      <a href="/admin/login" className={`${link} mt-4 inline-block`}>
        Cancel
      </a>
    </div>
  );
}
