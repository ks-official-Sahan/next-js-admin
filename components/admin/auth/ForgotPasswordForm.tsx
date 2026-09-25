"use client";

import { useActionState } from "react";

import { requestPasswordResetAction } from "@/lib/actions/forgot-password";
import { idleState } from "@/lib/actions/state";

const field =
  "mt-1.5 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primary =
  "inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const link =
  "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function ForgotPasswordForm({ loginUrl }: { loginUrl: string }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, idleState);

  return (
    <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">Enter your email and we&apos;ll send a reset link if there&apos;s an account.</p>

      {state.message ? (
        <p role="status" className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {state.message}
        </p>
      ) : (
        <form action={action} className="mt-5 space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              maxLength={254}
              className={field}
            />
            {state.fieldErrors?.email ? <p className="mt-1 text-xs text-destructive">{state.fieldErrors.email}</p> : null}
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <button type="submit" disabled={pending} className={primary}>
            {pending ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}

      <a href={loginUrl} className={`${link} mt-4 inline-block`}>
        Back to sign in
      </a>
    </div>
  );
}
