"use client";

import { useActionState } from "react";

import { completeSignIn, resendSignInCode, startSignIn, type SignInState } from "@/lib/actions/auth";

const initial: SignInState = { error: null };

const field =
  "mt-1.5 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primary =
  "inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const link =
  "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Two steps for an account with a second factor: the password, then the emailed
 * code. The state that carries the challenge is the result of the last action, so
 * a reload starts again from the password.
 */
export default function LoginForm({ callbackUrl, notice }: { callbackUrl: string; notice: string | null }) {
  const [first, startAction, startPending] = useActionState(startSignIn, initial);
  const [second, codeAction, codePending] = useActionState(completeSignIn, initial);
  const [resent, resendAction, resendPending] = useActionState(resendSignInCode, initial);

  // The freshest result decides what is on screen. A resend replaces the challenge id.
  const challengeId = resent.challengeId ?? second.challengeId ?? first.challengeId;
  const shownNotice = resent.notice ?? second.notice ?? first.notice ?? notice;
  const error = resent.error ?? second.error ?? first.error;

  return (
    <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h1 className="text-xl font-semibold tracking-tight">{challengeId ? "Check your email" : "Sign in"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {challengeId ? "Enter the code we sent you." : "Use your admin account."}
      </p>

      {shownNotice ? (
        <p role="status" className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {shownNotice}
        </p>
      ) : null}

      {challengeId ? (
        <>
          <form action={codeAction} className="mt-5 space-y-4" noValidate>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <input type="hidden" name="challengeId" value={challengeId} />
            <div>
              <label htmlFor="code" className="text-sm font-medium">
                6 digit code
              </label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                autoFocus
                required
                maxLength={10}
                className={`${field} tracking-[0.3em]`}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={codePending} className={primary}>
              {codePending ? "Checking..." : "Verify and sign in"}
            </button>
          </form>
          <form action={resendAction} className="mt-3 flex items-center justify-between">
            <input type="hidden" name="challengeId" value={challengeId} />
            <button type="submit" disabled={resendPending} className={link}>
              {resendPending ? "Sending..." : "Send a new code"}
            </button>
            <a href={`?${new URLSearchParams({ callbackUrl })}`} className={link}>
              Start over
            </a>
          </form>
        </>
      ) : (
        <form action={startAction} className="mt-5 space-y-4" noValidate>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />

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
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              className={field}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={startPending} className={primary}>
            {startPending ? "Signing in..." : "Sign in"}
          </button>

          <a href="/admin/forgot-password" className={`${link} block text-center`}>
            Forgot your password?
          </a>
        </form>
      )}
    </div>
  );
}
