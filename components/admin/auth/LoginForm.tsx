"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import Link from "next/link";
import { useActionState, useId, useState, useSyncExternalStore, useTransition } from "react";

import Icon, { type IconSpec } from "@/components/icons/Icon";
import { PasswordInput } from "@/components/admin/ui/PasswordField";
import {
  completeFactorSignIn,
  completePasskeySignIn,
  completePasswordlessSignIn,
  completeSignIn,
  passkeySignInOptions,
  passwordlessSignInOptions,
  resendSignInCode,
  startSignIn,
  type PasskeyOptionsResult,
  type SignInState,
} from "@/lib/actions/auth";
import { passkeyErrorMessage, unsupportedReason } from "@/lib/auth/passkey-browser";

import { usePasskeySupport, usePreparedOptions } from "./use-passkey";

const initial: SignInState = { error: null };

type Method = "passkey" | "totp" | "email";
type Choice = Method | "recovery";
type PasskeyOptions = Parameters<typeof startAuthentication>[0]["optionsJSON"];
type PreparedSignIn = Extract<PasskeyOptionsResult, { ok: true }>;

// Strongest first: with nothing remembered, the first usable one is shown.
const METHODS: readonly Method[] = ["passkey", "totp", "email"];
const METHOD_INFO: Record<Choice, { label: string; detail: string; icon: IconSpec }> = {
  passkey: { label: "Passkey", detail: "Fingerprint, face or device PIN, or a security key", icon: { lucideIconName: "KeyRound" } },
  totp: { label: "Authenticator app", detail: "A 6 digit code from your app", icon: { lucideIconName: "Smartphone" } },
  email: { label: "Email code", detail: "We email a 6 digit code to your address", icon: { name: "mail-filled" } },
  recovery: { label: "Recovery code", detail: "One of the codes you saved when you set this up", icon: { lucideIconName: "LifeBuoy" } },
};
// The method picked last time on this browser, a convenience only.
const METHOD_KEY = "app:admin:sign-in-method";
// Wrong answers on the second step before the other ways open by themselves.
const FAILURES_BEFORE_OPTIONS = 2;
// Event handlers stamp their results; a module-level clock keeps render pure.
const clock = () => Date.now();
const UNREACHABLE = "Could not reach the server. Check your connection and try again.";

const field =
  "mt-1.5 block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primary =
  "inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const link =
  "text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const option =
  "flex w-full items-center gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background";

function rememberedMethod(): Method | null {
  try {
    const value = window.localStorage.getItem(METHOD_KEY);
    return METHODS.find((method) => method === value) ?? null;
  } catch {
    return null;
  }
}

const noSubscription = () => () => {};

function rememberMethod(method: Method) {
  try {
    window.localStorage.setItem(METHOD_KEY, method);
  } catch {
    // Storage blocked: the default order applies next time.
  }
}

/** The newest result of the step actions decides what is on screen. */
function newest(...states: SignInState[]): SignInState {
  return states.reduce((best, state) => ((state.at ?? 0) > (best.at ?? 0) ? state : best), initial);
}

/** A server action that could not be reached answers null; navigation (redirect on success) still goes through. */
async function reach<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (error) {
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw error;
    return null;
  }
}

function ErrorText({ error }: { error: string | null | undefined }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

function CodeField({ id, label, numeric, autoFocus }: { id: string; label: string; numeric: boolean; autoFocus: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name="code"
        inputMode={numeric ? "numeric" : "text"}
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        required
        maxLength={20}
        className={`${field} ${numeric ? "tracking-[0.3em]" : "tracking-[0.15em]"}`}
      />
    </div>
  );
}

function MethodBadge({ choice }: { choice: Choice }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-foreground" aria-hidden="true">
      <Icon {...METHOD_INFO[choice].icon} className="size-4" />
    </span>
  );
}

/**
 * Signing in: the password, then, for an account with a second factor, one
 * method at a time (the one used last on this browser, else the strongest
 * that works here) with "Try another way" for the others. Recovery codes are
 * never the method on screen by default: they join "Try another way" after
 * FAILURES_BEFORE_OPTIONS wrong attempts, or at once when no other method
 * works on this device. A passkey is only offered where it can work: WebAuthn,
 * a secure page, and the relying party's own address. With `passkeySignIn`, a
 * passkey alone can sign in from the first step. The step's state is the
 * result of the last action, so a reload starts again from the password.
 */
export default function LoginForm({
  callbackUrl,
  notice,
  passkeySignIn,
  rpId,
}: {
  callbackUrl: string;
  notice: string | null;
  passkeySignIn: boolean;
  /** The passkey relying party (lib/auth/passkeys.ts), to tell whether this address can use one. */
  rpId: string;
}) {
  const [failures, setFailures] = useState(0);
  // A wrong answer keeps the second step open with an error: count it.
  const counted =
    (action: (previous: SignInState, formData: FormData) => Promise<SignInState>) =>
    async (previous: SignInState, formData: FormData) => {
      const next = await action(previous, formData);
      if (next.error && next.challengeId) setFailures((count) => count + 1);
      return next;
    };

  const [first, startAction, startPending] = useActionState(startSignIn, initial);
  const [emailed, codeAction, codePending] = useActionState(counted(completeSignIn), initial);
  const [factor, factorAction, factorPending] = useActionState(counted(completeFactorSignIn), initial);
  const [resent, resendAction, resendPending] = useActionState(resendSignInCode, initial);
  const [passkey, setPasskey] = useState<SignInState>(initial);
  const [passkeyPending, startPasskey] = useTransition();
  const [chosen, setChosen] = useState<Choice | null>(null);
  const [picking, setPicking] = useState(false);
  // Switching method hides the previous method's error.
  const [dismissedAt, setDismissedAt] = useState(0);
  const remembered = useSyncExternalStore(noSubscription, rememberedMethod, () => null);
  const support = usePasskeySupport(rpId);
  const listId = useId();

  const state = newest(first, emailed, factor, resent, passkey);
  const { challengeId, methods } = state;
  const shownNotice = state.notice ?? (challengeId ? null : notice);
  const error = dismissedAt > 0 && (state.at ?? 0) <= dismissedAt ? null : state.error;

  // Until hydration says otherwise (support null), assume the passkey works.
  const passkeyWorks = support === null || support === "ready";
  const passkeyBlocked = Boolean(methods?.passkey) && !passkeyWorks;
  const offered = methods ? METHODS.filter((method) => methods[method] && (method !== "passkey" || passkeyWorks)) : [];

  // The method on screen: the one picked now, then email once a code was sent,
  // then the one used last time on this browser, then the strongest offered.
  const fallback = offered.find((method) => method === remembered) ?? offered[0];
  const active: Choice | undefined =
    chosen === "recovery" && methods?.recovery
      ? "recovery"
      : chosen && chosen !== "recovery" && offered.includes(chosen)
        ? chosen
        : state.emailSent && methods?.email
          ? "email"
          : fallback;

  // Recovery codes are the last resort: offered after repeated failures, or
  // when nothing else works here (so the owner is never locked out).
  const nothingWorks = offered.length === 0;
  const recoveryOffered = Boolean(methods?.recovery) && active !== "recovery" && (nothingWorks || failures >= FAILURES_BEFORE_OPTIONS);
  const others: Choice[] = [...offered.filter((method) => method !== active), ...(recoveryOffered ? (["recovery"] as const) : [])];
  // A failed passkey, repeated wrong codes, or no usable method opens the other ways by themselves.
  const listOpen = others.length > 0 && (picking || nothingWorks || (Boolean(error) && (active === "passkey" || failures >= FAILURES_BEFORE_OPTIONS)));

  const signInOptions = usePreparedOptions<PreparedSignIn>(
    challengeId && active === "passkey" && support === "ready" ? challengeId : null,
    async () => {
      const options = challengeId ? await passkeySignInOptions(challengeId) : null;
      return options?.ok ? options : null;
    }
  );
  const passwordlessOptions = usePreparedOptions<unknown>(passkeySignIn && !challengeId && support === "ready" ? "passwordless" : null, async () => {
    const options = await passwordlessSignInOptions();
    return options.ok ? options.options : null;
  });

  function passkeyFailed(message: string) {
    setPasskey({ ...state, error: message, at: clock() });
    if (state.challengeId) setFailures((count) => count + 1);
  }

  // Prepared options let the prompt open inside the tap itself; only when none
  // are ready does the tap fetch them first.
  function verifyWithPasskey(id: string) {
    const ready = signInOptions.take();
    startPasskey(async () => {
      try {
        await attemptPasskey(id, ready);
      } finally {
        signInOptions.refresh();
      }
    });
  }

  async function attemptPasskey(id: string, ready: PreparedSignIn | null) {
    let prepared = ready;
    if (!prepared) {
      const fetched = await reach(() => passkeySignInOptions(id));
      if (!fetched) return passkeyFailed(UNREACHABLE);
      if (!fetched.ok) return passkeyFailed(fetched.error);
      prepared = fetched;
    }
    let response: Awaited<ReturnType<typeof startAuthentication>>;
    try {
      response = await startAuthentication({ optionsJSON: prepared.options as PasskeyOptions });
    } catch (failure) {
      return passkeyFailed(passkeyErrorMessage(failure, rpId, "sign-in"));
    }
    const passkeyChallengeId = prepared.passkeyChallengeId;
    // Redirects on success; returns a state only when something went wrong.
    const next = await reach(() => completePasskeySignIn({ challengeId: id, passkeyChallengeId, response, callbackUrl }));
    if (!next) return passkeyFailed(UNREACHABLE);
    setPasskey(next);
    if (next.error && next.challengeId) setFailures((count) => count + 1);
  }

  function signInWithPasskeyOnly() {
    const ready = passwordlessOptions.take();
    startPasskey(async () => {
      try {
        await attemptPasswordless(ready);
      } finally {
        passwordlessOptions.refresh();
      }
    });
  }

  async function attemptPasswordless(ready: unknown) {
    let options = ready;
    if (!options) {
      const fetched = await reach(() => passwordlessSignInOptions());
      if (!fetched) return setPasskey({ error: UNREACHABLE, at: clock() });
      if (!fetched.ok) return setPasskey({ error: fetched.error, at: clock() });
      options = fetched.options;
    }
    let response: Awaited<ReturnType<typeof startAuthentication>>;
    try {
      response = await startAuthentication({ optionsJSON: options as PasskeyOptions });
    } catch (failure) {
      return setPasskey({ error: passkeyErrorMessage(failure, rpId, "sign-in"), at: clock() });
    }
    setPasskey((await reach(() => completePasswordlessSignIn({ response, callbackUrl }))) ?? { error: UNREACHABLE, at: clock() });
  }

  function choose(choice: Choice) {
    setChosen(choice);
    setPicking(false);
    setDismissedAt(clock());
    if (choice !== "recovery") rememberMethod(choice);
  }

  const startOver = (
    <a href={`?${new URLSearchParams({ callbackUrl })}`} className={link}>
      Start over
    </a>
  );
  const hidden = (
    <>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <input type="hidden" name="challengeId" value={challengeId ?? ""} />
    </>
  );

  const lead = !challengeId
    ? "Use your admin account."
    : active === "passkey"
      ? "Use the passkey saved on this device, your phone or a security key."
      : active === "totp"
        ? "Enter the 6 digit code from your authenticator app."
        : active === "email"
          ? state.emailSent
            ? "Enter the code we emailed you."
            : "We will email a 6 digit code to your address."
          : active === "recovery"
            ? "Enter one of your recovery codes. Each one works once."
            : methods?.recovery
              ? "None of this account's sign-in methods works on this device. Use a recovery code below."
              : "None of this account's sign-in methods works on this device.";

  return (
    <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h1 className="text-xl font-semibold tracking-tight">{challengeId ? "Confirm it is you" : "Sign in"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{lead}</p>

      {shownNotice ? (
        <p role="status" className="mt-4 rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {shownNotice}
        </p>
      ) : null}

      {challengeId && methods ? (
        <div className="mt-5 space-y-4">
          {active ? (
            <div className="flex items-center gap-3">
              <MethodBadge choice={active} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{METHOD_INFO[active].label}</p>
                <p className="text-xs text-muted-foreground">{METHOD_INFO[active].detail}</p>
              </div>
            </div>
          ) : null}

          {passkeyBlocked && offered.length === 0 ? (
            <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
              {unsupportedReason(support ?? "ready", rpId)}
            </p>
          ) : null}

          {active === "passkey" ? (
            <button type="button" onClick={() => verifyWithPasskey(challengeId)} disabled={passkeyPending} className={primary}>
              {passkeyPending ? "Waiting for your passkey..." : "Use a passkey"}
            </button>
          ) : null}

          {active === "totp" || active === "recovery" ? (
            <form action={factorAction} className="space-y-4" noValidate>
              {hidden}
              <input type="hidden" name="method" value={active} />
              <CodeField
                key={active}
                id="factor-code"
                label={active === "totp" ? "6 digit code" : "Recovery code"}
                numeric={active === "totp"}
                autoFocus
              />
              <button type="submit" disabled={factorPending} className={primary}>
                {factorPending ? "Checking..." : "Verify and sign in"}
              </button>
            </form>
          ) : null}

          {active === "email" && state.emailSent ? (
            <form action={codeAction} className="space-y-4" noValidate>
              {hidden}
              <CodeField id="email-code" label="6 digit code" numeric autoFocus />
              <button type="submit" disabled={codePending} className={primary}>
                {codePending ? "Checking..." : "Verify and sign in"}
              </button>
            </form>
          ) : null}

          {active === "email" ? (
            <form action={resendAction}>
              <input type="hidden" name="challengeId" value={challengeId} />
              <button type="submit" disabled={resendPending} className={state.emailSent ? link : primary}>
                {resendPending ? "Sending..." : state.emailSent ? "Send a new code" : "Email me a code"}
              </button>
            </form>
          ) : null}

          <ErrorText error={error} />

          {listOpen ? (
            <section id={listId} aria-label="Other ways to confirm it is you" className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Other ways</p>
              <ul className="space-y-2">
                {others.map((choice) => (
                  <li key={choice}>
                    <button type="button" onClick={() => choose(choice)} className={option}>
                      <MethodBadge choice={choice} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{METHOD_INFO[choice].label}</span>
                        <span className="block text-xs text-muted-foreground">{METHOD_INFO[choice].detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {passkeyBlocked && offered.length > 0 ? (
                  <li>
                    <button type="button" disabled className={option}>
                      <MethodBadge choice="passkey" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{METHOD_INFO.passkey.label}</span>
                        <span className="block text-xs text-muted-foreground">{unsupportedReason(support ?? "ready", rpId)}</span>
                      </span>
                    </button>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {others.length > 0 ? (
              <button type="button" aria-expanded={listOpen} aria-controls={listId} onClick={() => setPicking(!listOpen)} className={link}>
                {listOpen ? "Hide other ways" : "Try another way"}
              </button>
            ) : (
              <span />
            )}
            {startOver}
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <form action={startAction} className="space-y-4" noValidate>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />

            <div>
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username webauthn"
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
              <PasswordInput id="password" name="password" autoComplete="current-password" required maxLength={1024} className="mt-1.5" />
            </div>

            <ErrorText error={state.error} />

            <button type="submit" disabled={startPending} className={primary}>
              {startPending ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {passkeySignIn && support === "ready" ? (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <button type="button" onClick={signInWithPasskeyOnly} disabled={passkeyPending} className={secondary}>
                {passkeyPending ? "Waiting for your passkey..." : "Sign in with a passkey"}
              </button>
            </>
          ) : null}

          <Link href="/admin/forgot-password" className={`${link} block text-center`}>
            Forgot your password?
          </Link>
        </div>
      )}
    </div>
  );
}
