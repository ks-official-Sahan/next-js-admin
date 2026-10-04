"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit, auditSafe } from "@/lib/admin/audit";
import { done, fail, fieldErrorsFrom, formValues, type ActionState } from "@/lib/actions/state";
import { authorizeAction } from "@/lib/actions/guard";
import { INVITE_TTL_HOURS, RESET_TTL_MINUTES, createToken } from "@/lib/auth/invite-token";
import { checkPassword } from "@/lib/auth/password-policy";
import { hashPassword } from "@/lib/auth/password";
import { ROLES, type RoleName } from "@/lib/auth/permissions";
import { assignableRoles } from "@/lib/auth/rbac-rules";
import { invalidateSessionState, invalidateUserSessionState, revokeUserSessions } from "@/lib/auth/session-store";
import { limit } from "@/lib/cache/ratelimit";
import { repos, withTx } from "@/lib/data";
import { sendEmail } from "@/lib/email";
import { invite, passwordReset } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import { absoluteUrl } from "@/lib/site-url";
import { checkChangeRole, checkDelete, checkInvite, checkReset, checkSetDisabled } from "@/lib/users/rules";
import { countActiveDevelopers, findUserRef } from "@/lib/users/service";

// Every change to another account. Order in each function: authorize, validate,
// check the rules, write the change and its audit row in one transaction, then
// tell the user. A Server Function is a public endpoint, so the page that shows
// the button is never the only guard (design notes, sections 6.1
// and 6.5).

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const role = z.enum(ROLES, { message: "Choose a role." });
const name = z.string().trim().max(80, "Use at most 80 characters.");

function authSecret(): string {
  const secret = getEnv().AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

const USERS_PATH = "/admin/users";
const UNEXPECTED = "Something went wrong. Nothing was changed.";

/** Thrown inside a transaction to abort it with a message for the user. */
class Refused extends Error {}

const failed = (error: unknown) => (error instanceof Refused ? fail(error.message) : fail(UNEXPECTED));

const targetOf = async (formData: FormData) => {
  const id = formData.get("userId");
  return typeof id === "string" && id ? findUserRef(id) : null;
};

export async function inviteUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("inviteUser");
  if (!access.ok) return fail(access.error);
  const { user: actor } = access;

  const parsed = z.object({ email, role }).safeParse(formValues(formData));
  if (!parsed.success) return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));

  const allowed = checkInvite(actor, parsed.data.role);
  if (!allowed.ok) return fail(allowed.error);
  if (!(await limit("invite:actor", actor.id)).ok) return fail("You sent many invitations. Try again in an hour.");

  if (await repos.users.existsByEmail(parsed.data.email)) {
    return fail("An account with that email already exists.", { email: "Already has an account." });
  }

  const { token, hash } = createToken(authSecret());
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
  try {
    const row = await withTx(async (tx) => {
      // One open invitation per address: a new one replaces the old link.
      // Never cancel an invitation for a role this actor could not have sent.
      await tx.authTokens.revokeOpenInvitesTo(parsed.data.email, { roles: assignableRoles(actor.role), createdById: actor.id });
      const created = await tx.authTokens.create({
        purpose: "INVITE",
        email: parsed.data.email,
        role: parsed.data.role,
        tokenHash: hash,
        createdById: actor.id,
        expiresAt,
      });
      await audit(
        {
          action: "user.invited",
          actor,
          entityType: "AuthToken",
          entityId: created.id,
          after: { email: parsed.data.email, role: parsed.data.role, expiresAt },
        },
        tx
      );
      return created;
    });

    const rendered = invite({
      inviterName: actor.name ?? actor.email,
      role: parsed.data.role,
      url: absoluteUrl(`/admin/set-password?token=${encodeURIComponent(token)}`),
      expiresHours: INVITE_TTL_HOURS,
    });
    const sent = await sendEmail(
      { to: parsed.data.email, subject: rendered.subject, html: rendered.html, text: rendered.text, category: "security" },
      { actor }
    );
    if (!sent.ok) {
      await repos.authTokens.revoke(row.id);
      return fail("The invitation could not be emailed, so it was cancelled. Check the email settings and try again.");
    }
  } catch {
    return fail(UNEXPECTED);
  }

  revalidatePath(USERS_PATH);
  return done(`Invitation sent to ${parsed.data.email}. The link works once and lasts ${INVITE_TTL_HOURS} hours.`);
}

export async function revokeInvite(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("inviteUser");
  if (!access.ok) return fail(access.error);

  const id = formData.get("inviteId");
  if (typeof id !== "string" || !id) return fail("Missing invitation.");

  try {
    const revoked = await withTx(async (tx) => {
      const row = await tx.authTokens.findOpenInvite(id);
      if (!row) return null;
      // A manager may only cancel invitations for roles they could have sent.
      if (!checkInvite(access.user, row.role ?? "EDITOR").ok) return null;
      if ((await tx.authTokens.revokeIfOpen(id)) === 0) return null;
      await audit(
        { action: "invite.revoked", actor: access.user, entityType: "AuthToken", entityId: id, before: { email: row.email, role: row.role } },
        tx
      );
      return row;
    });
    if (!revoked) return fail("That invitation is no longer open, or you may not cancel it.");
  } catch {
    return fail(UNEXPECTED);
  }

  revalidatePath(USERS_PATH);
  return done("Invitation cancelled.");
}

export async function createUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("manageUsers");
  if (!access.ok) return fail(access.error);
  const { user: actor } = access;

  const parsed = z
    .object({ email, role, name, password: z.string().max(128, "Use at most 128 characters.") })
    .safeParse(formValues(formData));
  if (!parsed.success) return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));

  const allowed = checkInvite(actor, parsed.data.role);
  if (!allowed.ok) return fail(allowed.error);

  const policy = checkPassword(parsed.data.password, { email: parsed.data.email, name: parsed.data.name });
  if (!policy.ok) return fail("Choose a stronger password.", { password: policy.problems.join(" ") });

  if (await repos.users.existsByEmail(parsed.data.email)) {
    return fail("An account with that email already exists.", { email: "Already has an account." });
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    await withTx(async (tx) => {
      const created = await tx.users.create({
        email: parsed.data.email,
        name: parsed.data.name || null,
        role: parsed.data.role,
        passwordHash,
        // The creator knows this password, so the new user must replace it at first sign-in.
        mustChangePassword: true,
        createdById: actor.id,
      });
      await audit(
        {
          action: "user.created",
          actor,
          entityType: "User",
          entityId: created.id,
          after: { email: parsed.data.email, role: parsed.data.role, mustChangePassword: true },
        },
        tx
      );
    });
  } catch {
    return fail(UNEXPECTED);
  }

  revalidatePath(USERS_PATH);
  return done(`${parsed.data.email} can sign in with the password you set, and must change it first.`);
}

export async function changeRole(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("manageUsers");
  if (!access.ok) return fail(access.error);

  const parsed = role.safeParse(formData.get("role"));
  if (!parsed.success) return fail("Choose a role.");
  const target = await targetOf(formData);
  if (!target) return fail("That user does not exist.");

  const verdict = checkChangeRole({
    actor: access.user,
    target: { id: target.id, role: target.role, disabled: Boolean(target.disabledAt) },
    activeDevelopers: await countActiveDevelopers(),
    newRole: parsed.data,
  });
  if (!verdict.ok) return fail(verdict.error);

  try {
    await withTx(async (tx) => {
      // Locked and re-read: the checks above ran on a snapshot that may be stale.
      const activeDevelopers = await tx.users.lockActiveDevelopers();
      const fresh = await tx.users.findAccessState(target.id);
      if (!fresh) throw new Refused("That user does not exist.");
      const again = checkChangeRole({
        actor: access.user,
        target: { id: target.id, role: fresh.role, disabled: Boolean(fresh.disabledAt) },
        activeDevelopers,
        newRole: parsed.data,
      });
      if (!again.ok) throw new Refused(again.error);

      await tx.users.update(target.id, { role: parsed.data });
      await audit(
        {
          action: "user.role_changed",
          actor: access.user,
          entityType: "User",
          entityId: target.id,
          before: { role: fresh.role },
          after: { role: parsed.data },
          meta: { email: target.email },
        },
        tx
      );
    });
    await invalidateUserSessionState(target.id);
  } catch (error) {
    return failed(error);
  }

  revalidatePath(USERS_PATH);
  return done(`${target.email} is now ${parsed.data.toLowerCase()}.`);
}

export async function setDisabled(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("manageUsers");
  if (!access.ok) return fail(access.error);

  const disabled = formData.get("disabled") === "true";
  const target = await targetOf(formData);
  if (!target) return fail("That user does not exist.");

  const verdict = checkSetDisabled({
    actor: access.user,
    target: { id: target.id, role: target.role, disabled: Boolean(target.disabledAt) },
    activeDevelopers: await countActiveDevelopers(),
    disabled,
  });
  if (!verdict.ok) return fail(verdict.error);

  try {
    await withTx(async (tx) => {
      const activeDevelopers = await tx.users.lockActiveDevelopers();
      const fresh = await tx.users.findAccessState(target.id);
      if (!fresh) throw new Refused("That user does not exist.");
      const again = checkSetDisabled({
        actor: access.user,
        target: { id: target.id, role: fresh.role, disabled: Boolean(fresh.disabledAt) },
        activeDevelopers,
        disabled,
      });
      if (!again.ok) throw new Refused(again.error);

      await tx.users.update(target.id, { disabledAt: disabled ? new Date() : null });
      // Invitations a disabled person sent stop working with their account.
      if (disabled) await tx.authTokens.revokeOpenInvitesSentBy(target.id);
      await audit(
        {
          action: disabled ? "user.disabled" : "user.enabled",
          actor: access.user,
          entityType: "User",
          entityId: target.id,
          before: { disabled: !disabled },
          after: { disabled },
          meta: { email: target.email },
        },
        tx
      );
    });
    // A disabled account is signed out everywhere at once.
    if (disabled) {
      const ended = await revokeUserSessions(target.id, { userId: access.user.id, reason: "disabled" });
      if (ended.length > 0) {
        // The user was already disabled (transaction above committed) and
        // their sessions already revoked; an audit failure here must not
        // report that as a failed disable.
        await auditSafe({
          action: "auth.session.revoked",
          actor: access.user,
          entityType: "User",
          entityId: target.id,
          meta: { sessions: ended.length, reason: "disabled", email: target.email },
        });
      }
    } else {
      await invalidateUserSessionState(target.id);
    }
  } catch (error) {
    return failed(error);
  }

  revalidatePath(USERS_PATH);
  return done(disabled ? `${target.email} is disabled and signed out.` : `${target.email} is enabled again.`);
}

export async function deleteUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("deleteUser");
  if (!access.ok) return fail(access.error);

  const target = await targetOf(formData);
  if (!target) return fail("That user does not exist.");

  // Typing the address makes a slip on the wrong row harmless.
  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== target.email) return fail("Type the user's email address to confirm.", { confirm: "Does not match." });

  const verdict = checkDelete({
    actor: access.user,
    target: { id: target.id, role: target.role, disabled: Boolean(target.disabledAt) },
    activeDevelopers: await countActiveDevelopers(),
  });
  if (!verdict.ok) return fail(verdict.error);

  // The rows go with the user, so note the ids first and drop their cached state after.
  const sessionIds = await repos.sessions.listIdsForUser(target.id);
  try {
    await withTx(async (tx) => {
      const activeDevelopers = await tx.users.lockActiveDevelopers();
      const fresh = await tx.users.findAccessState(target.id);
      if (!fresh) throw new Refused("That user does not exist.");
      const again = checkDelete({
        actor: access.user,
        target: { id: target.id, role: fresh.role, disabled: Boolean(fresh.disabledAt) },
        activeDevelopers,
      });
      if (!again.ok) throw new Refused(again.error);

      await tx.authTokens.deleteForUser(target.id);
      await tx.users.delete(target.id);
      await audit(
        {
          action: "user.deleted",
          actor: access.user,
          entityType: "User",
          entityId: target.id,
          before: { email: target.email, role: target.role, name: target.name },
        },
        tx
      );
    });
    if (sessionIds.length > 0) await invalidateSessionState(...sessionIds);
  } catch (error) {
    // Sessions and codes go with the user, posts and inquiries keep their rows with
    // the reference cleared, so a failure here is not a constraint.
    return failed(error);
  }

  revalidatePath(USERS_PATH);
  return done(`${target.email} was deleted.`);
}

export async function sendReset(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("resetPassword");
  if (!access.ok) return fail(access.error);

  const target = await targetOf(formData);
  if (!target) return fail("That user does not exist.");

  const verdict = checkReset({
    actor: access.user,
    target: { id: target.id, role: target.role, disabled: Boolean(target.disabledAt) },
    activeDevelopers: await countActiveDevelopers(),
  });
  if (!verdict.ok) return fail(verdict.error);
  if (!(await limit("invite:actor", access.user.id)).ok) return fail("You sent many links. Try again in an hour.");

  const { token, hash } = createToken(authSecret());
  try {
    const row = await withTx(async (tx) => {
      await tx.authTokens.revokeOpenForUser("PASSWORD_RESET", target.id);
      const created = await tx.authTokens.create({
        purpose: "PASSWORD_RESET",
        email: target.email,
        userId: target.id,
        tokenHash: hash,
        createdById: access.user.id,
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      });
      await audit(
        {
          action: "auth.password.reset_requested",
          actor: access.user,
          entityType: "User",
          entityId: target.id,
          meta: { email: target.email },
        },
        tx
      );
      return created;
    });

    const rendered = passwordReset({
      name: target.name,
      url: absoluteUrl(`/admin/set-password?token=${encodeURIComponent(token)}`),
      expiresMinutes: RESET_TTL_MINUTES,
    });
    const sent = await sendEmail(
      { to: target.email, subject: rendered.subject, html: rendered.html, text: rendered.text, category: "security" },
      { actor: access.user }
    );
    if (!sent.ok) {
      await repos.authTokens.revoke(row.id);
      return fail("The reset link could not be emailed, so it was cancelled. Check the email settings and try again.");
    }
  } catch {
    return fail(UNEXPECTED);
  }

  return done(`Reset link sent to ${target.email}. It works once and lasts ${RESET_TTL_MINUTES} minutes.`);
}
