"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auditSafe } from "@/lib/admin/audit";
import { retryMessage } from "@/lib/admin/rate-limited";
import { hasValidUnlock } from "@/lib/admin/unlock-request";
import { getOptionalUser } from "@/lib/auth/dal";
import { attemptSignIn, signOutAndRedirect } from "@/lib/auth/engine";
import {
  challengeOwner,
  issueChallenge,
  openTicket,
  openVerifiedTicket,
  signInMethods,
  verifyChallenge,
  verifyRecoveryCode,
  verifyTotp,
  type IssueResult,
  type MfaMethods,
  type VerifyResult,
} from "@/lib/auth/mfa";
import { MFA_TTL_MINUTES, normalizeCode } from "@/lib/auth/mfa-rules";
import { passkeys, passkeySignInEnabled, requestRelyingParty } from "@/lib/auth/passkeys";
import { safeCallbackUrl } from "@/lib/auth/safe-callback-url";
import { revokeSession } from "@/lib/auth/session-store";
import { limit } from "@/lib/cache/ratelimit";
import { repos } from "@/lib/data";
import { clientIp } from "@/lib/security/ip";
import type { AuthenticationResponseJSON } from "@sahan-sac/auth-kit/webauthn";

// Sign-in and sign-out as Server Functions. They stay POST requests to the
// admin route, so the proxy origin check and the Next origin check both apply
// (design notes, sections 4.5 and 6.1).
//
// An account with a second factor signs in in two steps. The password step
// starts no session: it opens a sign-in ticket, and the user verifies it with
// any method they set up (authenticator app, passkey, emailed code, or a
// recovery code). The second step starts the session. An account with only
// the emailed code gets its code at once.
//
// When the security.passkeySignIn setting is on, a passkey alone signs in
// (passwordlessSignInOptions / completePasswordlessSignIn): the passkey must
// verify the user (biometrics or device PIN), so it proves both steps. The
// unlock gate, a per-address limit, the disabled-account check and the
// sign-in itself (new-device email, audit) still apply.

export interface SignInState {
  error: string | null;
  /** Present while the form is on its second step. */
  challengeId?: string;
  methods?: MfaMethods;
  /** True once a code was emailed for this sign-in. */
  emailSent?: boolean;
  notice?: string | null;
  /** Orders results from the different step actions; the form shows the newest. */
  at?: number;
}

const GENERIC = "The email or password is not correct.";
const MESSAGES: Record<string, string> = {
  limited: "Too many attempts. Wait a while and try again.",
};
const ISSUE_ERRORS = {
  limited: "Too many codes were asked for.",
  locked: "Too many wrong codes. Wait a few minutes and try again.",
  send_failed: "The code could not be emailed. Try again in a moment.",
} as const;
const CODE_ERRORS = {
  invalid: "That code is not correct.",
  locked: "Too many wrong codes. Wait a few minutes and sign in again.",
  expired: "That code expired. Sign in again.",
  consumed: "That code was already used. Sign in again.",
} as const;
const EXPIRED = "That code expired. Sign in again.";
const NO_EMAIL = "Emailed codes are off for this account. Use another method.";
const PASSKEY_FAILED = "That passkey did not work. Try again or use another method.";
const PASSWORDLESS_OFF = "Passkey sign-in is not available. Sign in with your email and password.";

const stamp = (state: SignInState): SignInState => ({ ...state, at: Date.now() });

function messageFor(code: string | null | undefined): string {
  return (code && MESSAGES[code]) || GENERIC;
}

/** The second step, with every method the account may use. */
const secondStep = (challengeId: string, methods: MfaMethods, extra: Partial<SignInState> = {}): SignInState =>
  stamp({ error: null, notice: null, ...extra, challengeId, methods });

const emailedNotice = (email: string) => `We emailed a 6 digit code to ${email}. It works for ${MFA_TTL_MINUTES} minutes.`;

const issueError = (issued: Extract<IssueResult, { ok: false }>): SignInState =>
  stamp({ error: issued.error === "limited" ? `${ISSUE_ERRORS.limited} ${retryMessage(issued.retryAfterSeconds ?? 0)}` : ISSUE_ERRORS[issued.error] });

/** The open sign-in ticket's owner and what they may use, or null when it is gone. */
async function ticket(challengeId: unknown) {
  if (typeof challengeId !== "string" || !challengeId) return null;
  const owner = await challengeOwner(challengeId, "SIGN_IN");
  if (!owner || owner.user.disabledAt) return null;
  const methods = await signInMethods(owner.userId);
  return methods ? { challengeId, owner, methods } : null;
}

/** Starts the session from a verified ticket; returns an error state or redirects. */
async function finish(challengeId: string, callbackUrl: unknown): Promise<SignInState> {
  const refused = await attemptSignIn({ challengeId });
  if (refused) return stamp({ error: refused.code === "limited" ? MESSAGES.limited : EXPIRED });
  redirect(safeCallbackUrl(callbackUrl));
}

export async function startSignIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const target = safeCallbackUrl(formData.get("callbackUrl"));

  // Same answer as a wrong password, so this cannot be used to probe the unlock.
  if (!(await hasValidUnlock())) return stamp({ error: GENERIC });

  const refused = await attemptSignIn({
    email: typeof email === "string" ? email : "",
    password: typeof password === "string" ? password : "",
  });

  if (refused?.code === "mfa_required") {
    // The password was right (Auth.js only says so after the limiter and the hash
    // check), so it is safe to look the account up and open its second step.
    const user = await repos.users.findRefByEmail(String(email).trim().toLowerCase());
    if (!user || user.disabledAt) return stamp({ error: GENERIC });
    const methods = await signInMethods(user.id);
    if (!methods) return stamp({ error: GENERIC });
    if (methods.totp || methods.passkey) {
      // The user picks the method; nothing is emailed until they ask for it.
      const opened = await openTicket({ userId: user.id, purpose: "SIGN_IN" });
      return opened.ok ? secondStep(opened.challengeId, methods) : issueError(opened);
    }
    const issued = await issueChallenge({ userId: user.id, email: user.email, name: user.name, purpose: "SIGN_IN" });
    return issued.ok ? secondStep(issued.challengeId, methods, { emailSent: true, notice: emailedNotice(user.email) }) : issueError(issued);
  }
  if (refused) return stamp({ error: messageFor(refused.code) });

  redirect(target);
}

/** A wrong code keeps the step open; anything else needs a fresh sign-in. */
function verifyError(result: Extract<VerifyResult, { ok: false }>, keep: SignInState): SignInState {
  return result.reason === "invalid" ? stamp({ ...keep, error: CODE_ERRORS.invalid }) : stamp({ error: CODE_ERRORS[result.reason] });
}

export async function completeSignIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  if (!(await hasValidUnlock())) return stamp({ error: GENERIC });
  const open = await ticket(formData.get("challengeId"));
  if (!open) return stamp({ error: EXPIRED });

  const code = normalizeCode(String(formData.get("code") ?? ""));
  const keep = secondStep(open.challengeId, open.methods, { emailSent: true });
  if (!code) return stamp({ ...keep, error: "Enter the 6 digit code." });

  const verified = await verifyChallenge({ challengeId: open.challengeId, userId: open.owner.userId, email: open.owner.user.email, purpose: "SIGN_IN", code });
  if (!verified.ok) return verifyError(verified, keep);
  return finish(open.challengeId, formData.get("callbackUrl"));
}

/** The second step with an authenticator-app code or a recovery code (`method`). */
export async function completeFactorSignIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  if (!(await hasValidUnlock())) return stamp({ error: GENERIC });
  const open = await ticket(formData.get("challengeId"));
  if (!open) return stamp({ error: EXPIRED });

  const method = formData.get("method") === "recovery" ? "recovery" : "totp";
  const code = String(formData.get("code") ?? "").trim();
  const keep = secondStep(open.challengeId, open.methods);
  if (!open.methods[method]) return stamp({ ...keep, error: "That sign-in method is not set up for this account." });
  if (!code) return stamp({ ...keep, error: method === "totp" ? "Enter the 6 digit code from your app." : "Enter one of your recovery codes." });

  const input = { challengeId: open.challengeId, userId: open.owner.userId, email: open.owner.user.email, purpose: "SIGN_IN" as const, code };
  const verified = method === "totp" ? await verifyTotp(input) : await verifyRecoveryCode(input);
  if (!verified.ok) return verifyError(verified, keep);
  return finish(open.challengeId, formData.get("callbackUrl"));
}

/** Emails a code for this sign-in: the first one, or a new one. Any other method still works afterwards. */
export async function resendSignInCode(_previous: SignInState, formData: FormData): Promise<SignInState> {
  if (!(await hasValidUnlock())) return stamp({ error: GENERIC });
  const open = await ticket(formData.get("challengeId"));
  if (!open) return stamp({ error: EXPIRED });
  if (!open.methods.email) return secondStep(open.challengeId, open.methods, { error: NO_EMAIL });

  // Wrong tries carry over to the new code, so asking again is no way around the limit.
  const issued = await issueChallenge({ userId: open.owner.userId, email: open.owner.user.email, name: open.owner.user.name, purpose: "SIGN_IN" });
  return issued.ok
    ? secondStep(issued.challengeId, open.methods, { emailSent: true, notice: emailedNotice(open.owner.user.email) })
    : issueError(issued);
}

export type PasskeyOptionsResult = { ok: true; passkeyChallengeId: string; options: unknown } | { ok: false; error: string };

/** WebAuthn options for the passkey button on the second step. */
export async function passkeySignInOptions(challengeId: string): Promise<PasskeyOptionsResult> {
  if (!(await hasValidUnlock())) return { ok: false, error: GENERIC };
  const open = await ticket(challengeId);
  if (!open) return { ok: false, error: EXPIRED };
  if (!open.methods.passkey) return { ok: false, error: "No passkey is set up for this account." };
  const created = await passkeys.authenticationOptions(open.owner.userId, { rpID: await requestRelyingParty() });
  return created ? { ok: true, passkeyChallengeId: created.challengeId, options: created.options } : { ok: false, error: "No passkey is set up for this account." };
}

/** Verifies the browser's passkey assertion and starts the session. */
export async function completePasskeySignIn(input: {
  challengeId: string;
  passkeyChallengeId: string;
  response: AuthenticationResponseJSON;
  callbackUrl: string;
}): Promise<SignInState> {
  if (!input || typeof input.challengeId !== "string") return stamp({ error: GENERIC });
  if (!(await hasValidUnlock())) return stamp({ error: GENERIC });
  const open = await ticket(input.challengeId);
  if (!open) return stamp({ error: EXPIRED });
  if (!input.response || typeof input.response.id !== "string" || typeof input.passkeyChallengeId !== "string") {
    return secondStep(open.challengeId, open.methods, { error: "The passkey answer was not readable. Try again." });
  }

  const verified = await passkeys.verifyAuthentication({
    ticketId: open.challengeId,
    challengeId: input.passkeyChallengeId,
    userId: open.owner.userId,
    email: open.owner.user.email,
    response: input.response,
  });
  if (!verified.ok) {
    return verified.reason === "invalid"
      ? secondStep(open.challengeId, open.methods, { error: PASSKEY_FAILED })
      : stamp({ error: CODE_ERRORS[verified.reason] });
  }
  return finish(open.challengeId, input.callbackUrl);
}

/** The gate for passwordless sign-in: unlock cookie, the setting, and a per-address limit. */
async function passwordlessAllowed(): Promise<string | null> {
  if (!(await hasValidUnlock())) return GENERIC;
  if (!(await passkeySignInEnabled())) return PASSWORDLESS_OFF;
  // Clients with no readable address share one bucket (the UNKNOWN_IP key) rather than going unlimited.
  if (!(await limit("passkey-sign-in:ip", clientIp(await headers()))).ok) return MESSAGES.limited;
  return null;
}

export type PasswordlessOptionsResult = { ok: true; options: unknown } | { ok: false; error: string };

/**
 * WebAuthn options for "Sign in with a passkey": no account is named, so the
 * browser shows every passkey saved for this site and the person picks theirs.
 */
export async function passwordlessSignInOptions(): Promise<PasswordlessOptionsResult> {
  const refused = await passwordlessAllowed();
  if (refused) return { ok: false, error: refused };
  return { ok: true, options: await passkeys.passwordlessOptions({ rpID: await requestRelyingParty() }) };
}

/** Verifies a passwordless passkey assertion and starts the session for the passkey's owner. */
export async function completePasswordlessSignIn(input: { response: AuthenticationResponseJSON; callbackUrl: string }): Promise<SignInState> {
  // Each attempt needs fresh options, which count against the per-address limit.
  if (!(await hasValidUnlock())) return stamp({ error: GENERIC });
  if (!(await passkeySignInEnabled())) return stamp({ error: PASSWORDLESS_OFF });
  if (!input?.response || typeof input.response.id !== "string") return stamp({ error: PASSKEY_FAILED });

  const verified = await passkeys.verifyPasswordless(input.response);
  if (!verified.ok) return stamp({ error: verified.reason === "expired" ? "The passkey prompt expired. Try again." : PASSKEY_FAILED });

  const user = await repos.users.findRef(verified.userId);
  if (!user || user.disabledAt) return stamp({ error: PASSKEY_FAILED });
  const opened = await openVerifiedTicket({ userId: user.id, email: user.email, method: "passkey" });
  if (!opened.ok) return issueError(opened);
  return finish(opened.challengeId, input.callbackUrl);
}

export async function signOutAction(): Promise<void> {
  const user = await getOptionalUser();
  if (user) {
    await revokeSession(user.sid, { userId: user.id, reason: "sign_out" });
    await auditSafe({
      action: "auth.logout",
      actor: { id: user.id, email: user.email },
      entityType: "UserSession",
      entityId: user.sid,
    });
  }
  await signOutAndRedirect("/");
}
