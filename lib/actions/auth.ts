"use server";

import { redirect } from "next/navigation";

import { auditSafe } from "@/lib/admin/audit";
import { retryMessage } from "@/lib/admin/rate-limited";
import { hasValidUnlock } from "@/lib/admin/unlock-request";
import { getOptionalUser } from "@/lib/auth/dal";
import { attemptSignIn, signOutAndRedirect } from "@/lib/auth/engine";
import { challengeOwner, issueChallenge, verifyChallenge, type IssueResult } from "@/lib/auth/mfa";
import { MFA_TTL_MINUTES, normalizeCode } from "@/lib/auth/mfa-rules";
import { safeCallbackUrl } from "@/lib/auth/safe-callback-url";
import { revokeSession } from "@/lib/auth/session-store";
import { repos } from "@/lib/data";

// Sign-in and sign-out as Server Functions. They stay POST requests to the
// admin route, so the proxy origin check and the Next origin check both apply
// (design notes, sections 4.5 and 6.1).
//
// An account with a second factor signs in in two steps: the password (which
// emails a code, and starts no session), then the code (which does).

export interface SignInState {
  error: string | null;
  /** Present while the form is on its code step. */
  challengeId?: string;
  notice?: string | null;
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

function messageFor(code: string | null | undefined): string {
  return (code && MESSAGES[code]) || GENERIC;
}

const codeStep = (challengeId: string, email: string, notice?: string): SignInState => ({
  error: null,
  challengeId,
  notice: notice ?? `We emailed a 6 digit code to ${email}. It works for ${MFA_TTL_MINUTES} minutes.`,
});

const issueError = (issued: Extract<IssueResult, { ok: false }>): SignInState => ({
  error: issued.error === "limited" ? `${ISSUE_ERRORS.limited} ${retryMessage(issued.retryAfterSeconds ?? 0)}` : ISSUE_ERRORS[issued.error],
});

export async function startSignIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const target = safeCallbackUrl(formData.get("callbackUrl"));

  // Same answer as a wrong password, so this cannot be used to probe the unlock.
  if (!(await hasValidUnlock())) return { error: GENERIC };

  const refused = await attemptSignIn({
    email: typeof email === "string" ? email : "",
    password: typeof password === "string" ? password : "",
  });

  if (refused?.code === "mfa_required") {
    // The password was right (Auth.js only says so after the limiter and the hash
    // check), so it is safe to look the account up and send it a code.
    const user = await repos.users.findRefByEmail(String(email).trim().toLowerCase());
    if (!user || user.disabledAt) return { error: GENERIC };
    const issued = await issueChallenge({ userId: user.id, email: user.email, name: user.name, purpose: "SIGN_IN" });
    return issued.ok ? codeStep(issued.challengeId, user.email) : issueError(issued);
  }
  if (refused) return { error: messageFor(refused.code) };

  redirect(target);
}

export async function completeSignIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const challengeId = formData.get("challengeId");
  const target = safeCallbackUrl(formData.get("callbackUrl"));
  if (!(await hasValidUnlock())) return { error: GENERIC };
  if (typeof challengeId !== "string" || !challengeId) return { error: EXPIRED };

  const owner = await challengeOwner(challengeId, "SIGN_IN");
  if (!owner || owner.user.disabledAt) return { error: EXPIRED };

  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (!code) return { error: "Enter the 6 digit code.", challengeId };

  const verified = await verifyChallenge({
    challengeId,
    userId: owner.userId,
    email: owner.user.email,
    purpose: "SIGN_IN",
    code,
  });
  if (!verified.ok) {
    // A wrong code keeps the step open; anything else needs a fresh sign-in.
    return verified.reason === "invalid"
      ? { error: CODE_ERRORS.invalid, challengeId }
      : { error: CODE_ERRORS[verified.reason] };
  }

  const refused = await attemptSignIn({ challengeId });
  if (refused) return { error: refused.code === "limited" ? MESSAGES.limited : EXPIRED };

  redirect(target);
}

export async function resendSignInCode(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const challengeId = formData.get("challengeId");
  if (!(await hasValidUnlock())) return { error: GENERIC };
  if (typeof challengeId !== "string" || !challengeId) return { error: EXPIRED };

  const owner = await challengeOwner(challengeId, "SIGN_IN");
  if (!owner || owner.user.disabledAt) return { error: EXPIRED };

  // Wrong tries carry over to the new code, so asking again is no way around the limit.
  const issued = await issueChallenge({
    userId: owner.userId,
    email: owner.user.email,
    name: owner.user.name,
    purpose: "SIGN_IN",
  });
  return issued.ok
    ? codeStep(issued.challengeId, owner.user.email, `A new code was sent to ${owner.user.email}.`)
    : issueError(issued);
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
