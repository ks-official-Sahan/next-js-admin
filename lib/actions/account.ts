"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, auditSafe } from "@/lib/admin/audit";
import { retryMessage } from "@/lib/admin/rate-limited";
import { authorizeAction } from "@/lib/actions/guard";
import { done, fail, fieldErrorsFrom, formValues, type ActionState } from "@/lib/actions/state";
import { unstable_update } from "@/lib/auth/config";
import type { AuthUser } from "@/lib/auth/dal";
import { consumeChallenge, issueChallenge, verifyChallenge } from "@/lib/auth/mfa";
import { MFA_TTL_MINUTES, normalizeCode } from "@/lib/auth/mfa-rules";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { checkPassword } from "@/lib/auth/password-policy";
import { invalidateSessionState, invalidateUserSessionState, revokeSession, revokeUserSessions } from "@/lib/auth/session-store";
import { passwordFingerprint } from "@/lib/auth/session-state";
import { createToken, RESET_TTL_MINUTES } from "@/lib/auth/invite-token";
import { limit } from "@/lib/cache/ratelimit";
import { db } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email";
import { emailChangeVerify, mfaToggled, passwordChanged, type Rendered } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import { requestDetails } from "@/lib/security/request-device";
import { absoluteUrl } from "@/lib/site-url";

// The signed-in user's own account. A user whose password was set by someone else
// may use these before anything else, which is how they choose their own
// (design notes, sections 6.4 and 6.5).

const ACCOUNT_PATH = "/admin/account";
const UNEXPECTED = "Something went wrong. Nothing was changed.";
const OPTIONS = { allowPasswordChange: true } as const;

const secret = () => {
  const value = getEnv().AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
};

async function mail(user: Pick<AuthUser, "id" | "email">, rendered: Rendered) {
  await sendEmail(
    { to: user.email, subject: rendered.subject, html: rendered.html, text: rendered.text, category: "security" },
    { actor: user }
  ).catch(() => undefined);
}

/** Re-asks for the password before a sensitive change. Counts every try against the account. */
async function confirmPassword(user: AuthUser, given: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof given !== "string" || given.length === 0 || given.length > 128) {
    return { ok: false, error: "Enter your current password." };
  }
  if (!(await limit("login:acct", `pw:${user.id}`)).ok) {
    return { ok: false, error: "Too many attempts. Wait a while and try again." };
  }
  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await verifyPassword(given, row.passwordHash))) {
    await auditSafe({ action: "auth.password.check_failed", actor: user, entityType: "User", entityId: user.id });
    return { ok: false, error: "The current password is not correct." };
  }
  return { ok: true };
}

export async function updateProfile(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return fail(access.error);

  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter your name.").max(80, "Use at most 80 characters."),
      bio: z.string().trim().max(500, "Use at most 500 characters."),
    })
    .safeParse(formValues(formData));
  if (!parsed.success) return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));

  try {
    const before = await db.user.findUnique({ where: { id: access.user.id }, select: { name: true, bio: true } });
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: access.user.id },
        data: { name: parsed.data.name, bio: parsed.data.bio || null },
      });
      await audit(
        {
          action: "user.profile_updated",
          actor: access.user,
          entityType: "User",
          entityId: access.user.id,
          before,
          after: { name: parsed.data.name, bio: parsed.data.bio || null },
        },
        tx
      );
    });
    await invalidateUserSessionState(access.user.id);
  } catch {
    return fail(UNEXPECTED);
  }
  revalidatePath(ACCOUNT_PATH);
  return done("Profile saved.");
}

export async function changePassword(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const parsed = z
    .object({
      current: z.string().max(128),
      next: z.string().max(128, "Use at most 128 characters."),
      confirm: z.string().max(128),
    })
    .safeParse(formValues(formData));
  if (!parsed.success) return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));
  const { current, next, confirm } = parsed.data;

  if (next !== confirm) return fail("The two new passwords differ.", { confirm: "Does not match." });
  const policy = checkPassword(next, { email: user.email, name: user.name });
  if (!policy.ok) return fail("Choose a stronger password.", { next: policy.problems.join(" ") });
  if (next === current) return fail("Choose a new password, not the current one.", { next: "Same as the current one." });

  const verified = await confirmPassword(user, current);
  if (!verified.ok) return fail(verified.error, { current: verified.error });

  const passwordHash = await hashPassword(next);
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
      });
      // A reset link asked for before this change must not work after it.
      await tx.authToken.updateMany({
        where: { purpose: "PASSWORD_RESET", userId: user.id, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit({ action: "auth.password.changed", actor: user, entityType: "User", entityId: user.id }, tx);
    });

    // Every other session ends. This one stays: its cookie gets the new fingerprint.
    const ended = await revokeUserSessions(
      user.id,
      { userId: user.id, reason: "password_changed" },
      { exceptSid: user.sid }
    );
    await unstable_update({ pwf: passwordFingerprint(passwordHash, secret()) });
    await invalidateSessionState(user.sid);
    if (ended.length > 0) {
      // Session store mutation already succeeded; an audit failure here must
      // not turn a successful password change into a reported failure.
      await auditSafe({
        action: "auth.session.revoked",
        actor: user,
        entityType: "User",
        entityId: user.id,
        meta: { sessions: ended.length, reason: "password_changed" },
      });
    }
  } catch {
    return fail(UNEXPECTED);
  }

  await mail(user, passwordChanged(await requestDetails(user.name)));
  revalidatePath("/admin", "layout");
  return done("Password changed. Your other sessions were signed out.");
}

const emailField = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

/**
 * Starts a change of the account's own email. Confirms the current password
 * (same re-verification pattern as MFA toggling), then emails a confirmation
 * link to the NEW address — the change only takes effect once that inbox
 * proves it belongs to the account holder (lib/actions/confirm-email.ts).
 */
export async function requestEmailChangeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const parsed = z.object({ newEmail: emailField, password: z.string().max(128) }).safeParse(formValues(formData));
  if (!parsed.success) return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));
  const { newEmail, password } = parsed.data;

  if (newEmail === user.email) return fail("That is already your email address.", { newEmail: "Already your address." });

  const verified = await confirmPassword(user, password);
  if (!verified.ok) return fail(verified.error, { password: verified.error });

  if (!(await limit("email-change:user", user.id)).ok) return fail("Too many attempts. Wait a while and try again.");

  if (await db.user.findUnique({ where: { email: newEmail }, select: { id: true } })) {
    return fail("Another account already uses that address.", { newEmail: "Already in use." });
  }

  const secretValue = secret();
  const { token, hash } = createToken(secretValue);
  try {
    await db.$transaction(async (tx) => {
      await tx.authToken.updateMany({
        where: { purpose: "EMAIL_CHANGE", userId: user.id, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.authToken.create({
        data: {
          purpose: "EMAIL_CHANGE",
          email: newEmail,
          userId: user.id,
          tokenHash: hash,
          createdById: user.id,
          expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
        },
      });
      await audit(
        { action: "user.email_change_requested", actor: user, entityType: "User", entityId: user.id, meta: { newEmail } },
        tx
      );
    });
  } catch {
    return fail(UNEXPECTED);
  }

  const rendered = emailChangeVerify({
    name: user.name,
    url: absoluteUrl(`/admin/confirm-email?token=${encodeURIComponent(token)}`),
    expiresMinutes: RESET_TTL_MINUTES,
  });
  const sent = await sendEmail(
    { to: newEmail, subject: rendered.subject, html: rendered.html, text: rendered.text, category: "security" },
    { actor: user }
  );
  if (!sent.ok) return fail("The confirmation link could not be emailed. Check the email settings and try again.");

  return done(`A confirmation link was sent to ${newEmail}. It works once and lasts ${RESET_TTL_MINUTES} minutes.`);
}

// Second factor: the code goes to the account email. Enabling and disabling each
// take two steps. The first asks for the password (that is what starts a
// challenge), the second for the code, and a challenge only exists for the user
// and purpose it was made for.

async function startMfa(purpose: "ENABLE" | "DISABLE", formData: FormData): Promise<ActionState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const row = await db.user.findUnique({ where: { id: user.id }, select: { mfaEnabled: true } });
  if (!row) return fail(UNEXPECTED);
  if (purpose === "ENABLE" && row.mfaEnabled) return fail("Two-factor sign-in is already on.");
  if (purpose === "DISABLE" && !row.mfaEnabled) return fail("Two-factor sign-in is already off.");

  const verified = await confirmPassword(user, formData.get("password"));
  if (!verified.ok) return fail(verified.error, { password: verified.error });

  const issued = await issueChallenge({ userId: user.id, email: user.email, name: user.name, purpose });
  if (!issued.ok) {
    return fail(
      issued.error === "limited"
        ? `Too many codes asked for. ${retryMessage(issued.retryAfterSeconds ?? 0)}`
        : issued.error === "locked"
          ? "Too many wrong codes. Wait a few minutes."
          : "The code could not be emailed. Check the email settings."
    );
  }
  return done(`A code was sent to ${user.email}. It works for ${MFA_TTL_MINUTES} minutes.`, { challengeId: issued.challengeId });
}

const CODE_FAILURES = {
  invalid: "That code is not correct.",
  locked: "Too many wrong codes. Wait a few minutes and ask for a new one.",
  expired: "That code expired. Ask for a new one.",
  consumed: "That code was already used. Ask for a new one.",
} as const;

async function confirmMfa(purpose: "ENABLE" | "DISABLE", formData: FormData): Promise<ActionState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const challengeId = formData.get("challengeId");
  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (typeof challengeId !== "string" || !challengeId) return fail("Ask for a new code.");
  if (!code) return fail("Enter the 6 digit code.", { code: "Enter the 6 digit code." });

  const result = await verifyChallenge({ challengeId, userId: user.id, email: user.email, purpose, code });
  if (!result.ok) return fail(CODE_FAILURES[result.reason], { code: CODE_FAILURES[result.reason] });
  if (!(await consumeChallenge({ challengeId, userId: user.id, purpose }))) {
    return fail(CODE_FAILURES.expired);
  }

  const enabled = purpose === "ENABLE";
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { mfaEnabled: enabled } });
      await audit(
        {
          action: enabled ? "auth.mfa.enabled" : "auth.mfa.disabled",
          actor: user,
          entityType: "User",
          entityId: user.id,
          before: { mfaEnabled: !enabled },
          after: { mfaEnabled: enabled },
        },
        tx
      );
    });
    if (enabled) {
      // Sessions opened before the second factor existed never passed it: end them,
      // and mark this one, which just did.
      const ended = await revokeUserSessions(user.id, { userId: user.id, reason: "mfa_enabled" }, { exceptSid: user.sid });
      await db.userSession.update({ where: { id: user.sid }, data: { mfaVerified: true } });
      if (ended.length > 0) {
        // Same rule as above: the session revoke already happened.
        await auditSafe({
          action: "auth.session.revoked",
          actor: user,
          entityType: "User",
          entityId: user.id,
          meta: { sessions: ended.length, reason: "mfa_enabled" },
        });
      }
    }
    await invalidateUserSessionState(user.id);
  } catch {
    return fail(UNEXPECTED);
  }

  await mail(user, mfaToggled({ ...(await requestDetails(user.name)), enabled }));
  revalidatePath(ACCOUNT_PATH);
  return done(
    enabled ? "Two-factor sign-in is on. Your other sessions were signed out." : "Two-factor sign-in is off."
  );
}

export async function startMfaEnable(_previous: ActionState, formData: FormData) {
  return startMfa("ENABLE", formData);
}
export async function confirmMfaEnable(_previous: ActionState, formData: FormData) {
  return confirmMfa("ENABLE", formData);
}
export async function startMfaDisable(_previous: ActionState, formData: FormData) {
  return startMfa("DISABLE", formData);
}
export async function confirmMfaDisable(_previous: ActionState, formData: FormData) {
  return confirmMfa("DISABLE", formData);
}

// Own sessions.

export async function revokeMySession(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const sid = formData.get("sessionId");
  if (typeof sid !== "string" || !sid) return fail("Missing session.");
  if (sid === user.sid) return fail("Use Sign out to end this session.");

  // Only the user's own sessions: the userId in the filter is the guard.
  const owned = await db.userSession.findFirst({ where: { id: sid, userId: user.id }, select: { id: true } });
  if (!owned) return fail("That session does not exist.");

  const ended = await revokeSession(sid, { userId: user.id, reason: "revoked_by_user" });
  if (ended) {
    await auditSafe({ action: "auth.session.revoked", actor: user, entityType: "UserSession", entityId: sid });
  }
  revalidatePath(ACCOUNT_PATH);
  return done(ended ? "Session ended." : "That session had already ended.");
}

export async function revokeOtherSessions(_previous: ActionState, _formData: FormData): Promise<ActionState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const ended = await revokeUserSessions(
    user.id,
    { userId: user.id, reason: "revoked_by_user" },
    { exceptSid: user.sid }
  );
  if (ended.length > 0) {
    await auditSafe({
      action: "auth.session.revoked",
      actor: user,
      entityType: "User",
      entityId: user.id,
      meta: { sessions: ended.length, scope: "others" },
    });
  }
  revalidatePath(ACCOUNT_PATH);
  return done(
    ended.length > 0
      ? `Ended ${ended.length} other ${ended.length === 1 ? "session" : "sessions"}.`
      : "No other sessions were open."
  );
}
