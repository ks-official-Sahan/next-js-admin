"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { audit, auditMany, auditSafe, type AuditEvent } from "@/lib/admin/audit";
import { done, fail, fieldErrorsFrom, formValues, type ActionState } from "@/lib/actions/state";
import { authorizeAction } from "@/lib/actions/guard";
import { INVITE_TTL_HOURS, RESET_TTL_MINUTES, createToken } from "@/lib/auth/invite-token";
import { accountLink, signInLink } from "@/lib/auth/links";
import { checkPassword } from "@/lib/auth/password-policy";
import { hashPassword } from "@/lib/auth/password";
import { type Permission, type RoleName } from "@/lib/auth/permissions";
import { getRoleCatalog } from "@/lib/auth/roles";
import { invalidateSessionState, invalidateUserSessionState, revokeSessions, revokeUserSessions } from "@/lib/auth/session-store";
import { limit } from "@/lib/cache/ratelimit";
import { repos, withTx } from "@/lib/data";
import { sendAccountEmail } from "@/lib/email/account-mail";
import { accountCreated, invite, passwordReset } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import type { UserRef } from "@/lib/data/users";
import { log } from "@/lib/log";
import { notifyForcedLogout } from "@/lib/users/notify";
import {
  BULK_USER_OPS,
  checkChangeRole,
  checkDelete,
  checkInvite,
  checkReset,
  checkSetDisabled,
  planBulk,
  type BulkPlan,
  type BulkUserOp,
} from "@/lib/users/rules";
import { countActiveDevelopers, findUserRef } from "@/lib/users/service";

// Every change to another account. Order in each function: authorize, validate,
// check the rules, write the change and its audit row in one transaction, then
// tell the user. A Server Function is a public endpoint, so the page that shows
// the button is never the only guard (design notes, sections 6.1
// and 6.5).

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
// Any role name; whether it exists and the actor may give it is checkInvite's job.
const role = z.string().trim().min(1, "Choose a role.").max(32, "Choose a role.");
const name = z.string().trim().max(80, "Use at most 80 characters.");
const reasonText = z.string().trim().max(200, "Use at most 200 characters.");

function authSecret(): string {
  const secret = getEnv().AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

const USERS_PATH = "/admin/users";
const SESSIONS_PATH = "/admin/sessions";
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
  const roles = await getRoleCatalog();
  const { user: actor } = access;

  const parsed = z.object({ email, role }).safeParse(formValues(formData));
  if (!parsed.success) return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));

  const allowed = checkInvite(roles, actor, parsed.data.role);
  if (!allowed.ok) return fail(allowed.error);
  if (!(await limit("invite:actor", actor.id)).ok) return fail("You sent many invitations. Try again in an hour.");

  if (await repos.users.existsByEmail(parsed.data.email)) {
    return fail("An account with that email already exists.", { email: "Already has an account." });
  }

  // An unchecked box sends nothing, so the form puts a hidden "0" before the
  // checkbox's "1". A post with neither (an older page, a script) still emails.
  const notifyValues = formData.getAll("notify");
  const notify = notifyValues.length === 0 || notifyValues.includes("1");

  const { token, hash } = createToken(authSecret());
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
  try {
    await withTx(async (tx) => {
      // One open invitation per address: a new one replaces the old link.
      // Never cancel an invitation for a role this actor could not have sent.
      await tx.authTokens.revokeOpenInvitesTo(parsed.data.email, { roles: roles.assignable(actor.role), createdById: actor.id });
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
          after: { email: parsed.data.email, role: parsed.data.role, expiresAt, emailed: notify },
        },
        tx
      );
    });
  } catch {
    return fail(UNEXPECTED);
  }
  revalidatePath(USERS_PATH);

  // The link exists only in this response (the database keeps its hash), so
  // the inviter can copy it now or get a new one later from the list.
  const link = await accountLink(token);
  if (!notify) {
    return done(`Invitation created for ${parsed.data.email}. Copy the link and share it: it works once and lasts ${INVITE_TTL_HOURS} hours.`, { link });
  }

  const signInUrl = (await signInLink()).url;
  const sent = await sendAccountEmail({
    to: parsed.data.email,
    render: (options) =>
      invite({ inviterName: actor.name ?? actor.email, role: parsed.data.role, url: link, expiresHours: INVITE_TTL_HOURS, signInUrl }, options),
    category: "invite",
    actor,
  }).catch(() => ({ ok: false as const }));
  if (!sent.ok) {
    // Kept, not cancelled: the inviter has the link and can share it another way.
    return { ...fail("The invitation was created, but the email could not be sent. Copy the link and share it yourself."), link };
  }
  return done(`Invitation sent to ${parsed.data.email}. The link works once and lasts ${INVITE_TTL_HOURS} hours.`, { link });
}

/**
 * A new link for an open invitation: the old link stops working at once and
 * the 72 hours restart. The only way to copy a link again, because the raw
 * token is never stored.
 */
export async function regenerateInviteLink(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("inviteUser");
  if (!access.ok) return fail(access.error);
  const roles = await getRoleCatalog();

  const id = formData.get("inviteId");
  if (typeof id !== "string" || !id) return fail("Missing invitation.");
  if (!(await limit("invite:actor", access.user.id)).ok) return fail("You made many invitation links. Try again in an hour.");

  const { token, hash } = createToken(authSecret());
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
  let email: string;
  try {
    const rotated = await withTx(async (tx) => {
      const row = await tx.authTokens.findOpenInvite(id);
      if (!row || row.expiresAt.getTime() <= Date.now()) return null;
      // The same reach as cancelling it: only roles this actor could have sent.
      if (!checkInvite(roles, access.user, row.role ?? "EDITOR").ok) return null;
      if ((await tx.authTokens.rotateOpenInvite(id, hash, expiresAt)) === 0) return null;
      await audit(
        {
          action: "invite.link_regenerated",
          actor: access.user,
          entityType: "AuthToken",
          entityId: id,
          before: { expiresAt: row.expiresAt },
          after: { expiresAt },
          meta: { email: row.email, role: row.role },
        },
        tx
      );
      return row;
    });
    if (!rotated) return fail("That invitation is no longer open, or you may not change it.");
    email = rotated.email;
  } catch {
    return fail(UNEXPECTED);
  }

  revalidatePath(USERS_PATH);
  return done(`New link for ${email}. The previous link no longer works.`, { link: await accountLink(token) });
}

export async function revokeInvite(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("inviteUser");
  if (!access.ok) return fail(access.error);
  const roles = await getRoleCatalog();

  const id = formData.get("inviteId");
  if (typeof id !== "string" || !id) return fail("Missing invitation.");

  try {
    const revoked = await withTx(async (tx) => {
      const row = await tx.authTokens.findOpenInvite(id);
      if (!row) return null;
      // A manager may only cancel invitations for roles they could have sent.
      if (!checkInvite(roles, access.user, row.role ?? "EDITOR").ok) return null;
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
  const roles = await getRoleCatalog();
  const { user: actor } = access;

  const parsed = z
    .object({ email, role, name, password: z.string().max(128, "Use at most 128 characters.") })
    .safeParse(formValues(formData));
  if (!parsed.success) return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));
  // Same hidden "0" plus checkbox "1" as the invite form; a post with neither still emails.
  const notifyValues = formData.getAll("notify");
  const notify = notifyValues.length === 0 || notifyValues.includes("1");

  const allowed = checkInvite(roles, actor, parsed.data.role);
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
  const created = `${parsed.data.email} can sign in with the password you set, and must change it first.`;
  if (!notify) return done(created);

  // The email carries a sign-in link, never the password: share that another way.
  const signInUrl = (await signInLink()).url;
  const sent = await sendAccountEmail({
    to: parsed.data.email,
    render: (options) =>
      accountCreated({ name: parsed.data.name || null, creatorName: actor.name ?? actor.email, role: parsed.data.role, signInUrl }, options),
    category: "invite",
    actor,
  }).catch(() => ({ ok: false as const }));
  return sent.ok
    ? done(`${created} A sign-in link was emailed; share the password another way.`)
    : done(`${created} The welcome email could not be sent; share the sign-in page and password yourself.`);
}

export async function changeRole(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("manageUsers");
  if (!access.ok) return fail(access.error);
  const roles = await getRoleCatalog();

  const parsed = role.safeParse(formData.get("role"));
  if (!parsed.success) return fail("Choose a role.");
  const target = await targetOf(formData);
  if (!target) return fail("That user does not exist.");

  const verdict = checkChangeRole({
    roles,
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
        roles,
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
  const roles = await getRoleCatalog();

  const disabled = formData.get("disabled") === "true";
  const target = await targetOf(formData);
  if (!target) return fail("That user does not exist.");

  const verdict = checkSetDisabled({
    roles,
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
        roles,
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
  const roles = await getRoleCatalog();

  const target = await targetOf(formData);
  if (!target) return fail("That user does not exist.");

  // Typing the address makes a slip on the wrong row harmless.
  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== target.email) return fail("Type the user's email address to confirm.", { confirm: "Does not match." });

  const verdict = checkDelete({
    roles,
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
        roles,
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
  const roles = await getRoleCatalog();

  const target = await targetOf(formData);
  if (!target) return fail("That user does not exist.");

  const verdict = checkReset({
    roles,
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

    const url = await accountLink(token);
    const signInUrl = (await signInLink()).url;
    const sent = await sendAccountEmail({
      to: target.email,
      render: (options) => passwordReset({ name: target.name, url, expiresMinutes: RESET_TTL_MINUTES, signInUrl }, options),
      category: "password-reset",
      actor: access.user,
    });
    if (!sent.ok) {
      await repos.authTokens.revoke(row.id);
      return fail("The reset link could not be emailed, so it was cancelled. Check the email settings and try again.");
    }
  } catch {
    return fail(UNEXPECTED);
  }

  return done(`Reset link sent to ${target.email}. It works once and lasts ${RESET_TTL_MINUTES} minutes.`);
}

const BULK_MAX = 100;
/** Row ids are cuids; anything else in a selection is dropped before it reaches a query. */
const ROW_ID = /^[A-Za-z0-9_-]{1,64}$/;

const BULK_PERMISSION: Record<BulkUserOp, Permission> = {
  role: "manageUsers",
  disable: "manageUsers",
  enable: "manageUsers",
  "sign-out": "forceLogout",
  delete: "deleteUser",
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const BULK_DONE: Record<BulkUserOp, (count: number) => string> = {
  role: (count) => `Changed the role of ${plural(count, "user")}.`,
  disable: (count) => `Disabled and signed out ${plural(count, "user")}.`,
  enable: (count) => `Enabled ${plural(count, "user")}.`,
  "sign-out": (count) => `Signed out ${plural(count, "user")} everywhere.`,
  delete: (count) => `Deleted ${plural(count, "user")}.`,
};

type BulkUser = UserRef & { disabled: boolean };

/** " 2 skipped: a@x.com (reason); b@y.com (reason)." with at most three named. */
function skippedNote(skipped: BulkPlan<BulkUser>["skipped"], gone: number): string {
  const parts: string[] = [];
  if (skipped.length > 0) {
    const named = skipped.slice(0, 3).map(({ target, reason }) => `${target.email} (${reason.replace(/\.$/, "").toLowerCase()})`);
    parts.push(`${skipped.length} skipped: ${named.join("; ")}${skipped.length > 3 ? ` and ${skipped.length - 3} more` : ""}.`);
  }
  if (gone > 0) parts.push(`${plural(gone, "account")} no longer ${gone === 1 ? "exists" : "exist"}.`);
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function bulkEvent(op: Exclude<BulkUserOp, "sign-out">, actor: AuditEvent["actor"], target: BulkUser, newRole?: RoleName): AuditEvent {
  const base = { actor, entityType: "User", entityId: target.id };
  const meta = { email: target.email, bulk: true };
  switch (op) {
    case "role":
      return { ...base, action: "user.role_changed", before: { role: target.role }, after: { role: newRole }, meta };
    case "disable":
      return { ...base, action: "user.disabled", before: { disabled: false }, after: { disabled: true }, meta };
    case "enable":
      return { ...base, action: "user.enabled", before: { disabled: true }, after: { disabled: false }, meta };
    case "delete":
      return { ...base, action: "user.deleted", before: { email: target.email, role: target.role, name: target.name }, meta: { bulk: true } };
  }
}

/**
 * One action for many users: change role, disable, enable, sign out
 * everywhere, or delete. Every target goes through the same rule as the
 * single-user action (planBulk counts developers down as it goes), the
 * changes and one audit row per target commit in one transaction, and
 * targets the rules refuse are skipped and named in the result instead of
 * failing the rest.
 */
export async function bulkUsers(_previous: ActionState, formData: FormData): Promise<ActionState> {
  // The operation only chooses which permission to check: nothing is read or
  // written before authorizeAction.
  const op = BULK_USER_OPS.find((value) => value === formData.get("op"));
  const access = await authorizeAction(op ? BULK_PERMISSION[op] : "manageUsers");
  if (!access.ok) return fail(access.error);
  const roles = await getRoleCatalog();
  if (!op) return fail("Choose an action.");
  const actor = access.user;

  const ids = [...new Set(formData.getAll("ids").filter((id): id is string => typeof id === "string" && ROW_ID.test(id)))];
  if (ids.length === 0) return fail("Select at least one user.");
  if (ids.length > BULK_MAX) return fail(`Select at most ${BULK_MAX} users at a time.`);

  let newRole: RoleName | undefined;
  if (op === "role") {
    const parsed = role.safeParse(formData.get("role"));
    if (!parsed.success) return fail("Choose a role.");
    newRole = parsed.data;
  }
  if (op === "delete" && String(formData.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    return fail('Type "delete" to confirm.', { confirm: "Type delete to confirm." });
  }
  const signOutReason = reasonText.safeParse(formValues(formData).reason ?? "");
  if (!signOutReason.success) return fail(signOutReason.error.issues[0]?.message ?? "Check the reason.");

  const now = new Date();
  const asTarget = (user: UserRef): BulkUser => ({ ...user, disabled: Boolean(user.disabledAt) });
  let plan: BulkPlan<BulkUser>;
  let found = 0;
  let sessions: { id: string; userId: string }[] = [];

  try {
    if (op === "sign-out") {
      // Ends sessions only; no user row changes, so no lock is needed.
      const targets = (await repos.users.findRefs(ids)).map(asTarget);
      found = targets.length;
      plan = planBulk({ op, roles, actor, targets, activeDevelopers: 0 });
      sessions = await repos.sessions.listLiveForUsers(
        plan.apply.map((target) => target.id),
        now
      );
      await revokeSessions(
        sessions.map((session) => session.id),
        { userId: actor.id, reason: "force_logout" }
      );
    } else {
      plan = await withTx(async (tx) => {
        // Lock first, then read: the rules run on rows nobody else can demote meanwhile.
        const activeDevelopers = await tx.users.lockActiveDevelopers();
        const targets = (await tx.users.findRefs(ids)).map(asTarget);
        found = targets.length;
        const planned = planBulk({ op, roles, actor, role: newRole, targets, activeDevelopers });
        const applyIds = planned.apply.map((target) => target.id);
        if (applyIds.length === 0) return planned;

        if (op === "role") await tx.users.updateMany(applyIds, { role: newRole });
        if (op === "enable") await tx.users.updateMany(applyIds, { disabledAt: null });
        if (op === "disable") {
          await tx.users.updateMany(applyIds, { disabledAt: now });
          // Invitations a disabled person sent stop working with their account.
          await tx.authTokens.revokeOpenInvitesSentByAny(applyIds);
        }
        if (op === "delete") {
          // Their sessions go with them (cascade): note them to drop the cached state after.
          sessions = await tx.sessions.listLiveForUsers(applyIds, now);
          await tx.authTokens.deleteForUsers(applyIds);
          await tx.users.deleteMany(applyIds);
        }
        await auditMany(
          planned.apply.map((target) => bulkEvent(op, actor, target, newRole)),
          tx
        );
        return planned;
      });

      const applyIds = plan.apply.map((target) => target.id);
      if (op === "disable") {
        // A disabled account is signed out everywhere at once.
        sessions = await repos.sessions.listLiveForUsers(applyIds, now);
        await revokeSessions(
          sessions.map((session) => session.id),
          { userId: actor.id, reason: "disabled" }
        );
      } else if (op !== "delete") {
        // The cached session state carries the role and the disabled flag.
        sessions = await repos.sessions.listLiveForUsers(applyIds, now);
      }
      if (op !== "disable" && sessions.length > 0) await invalidateSessionState(...sessions.map((session) => session.id));
    }
  } catch (error) {
    return failed(error);
  }

  if (op === "sign-out" || (op === "disable" && sessions.length > 0)) {
    // The sessions are already ended; a failed audit write must not report that as a failure.
    const counts = new Map<string, number>();
    for (const session of sessions) counts.set(session.userId, (counts.get(session.userId) ?? 0) + 1);
    await auditMany(
      plan.apply
        .filter((target) => op === "sign-out" || counts.has(target.id))
        .map((target) => ({
          action: op === "sign-out" ? "auth.session.force_logout" : "auth.session.revoked",
          actor,
          entityType: "User",
          entityId: target.id,
          meta: {
            email: target.email,
            sessions: counts.get(target.id) ?? 0,
            reason: op === "sign-out" ? signOutReason.data || undefined : "disabled",
            bulk: true,
          },
        }))
    ).catch((error: unknown) => log.error("audit write failed", { action: "bulk session revoke", error: (error as Error).message }));

    if (op === "sign-out") {
      const notified = plan.apply.filter((target) => counts.has(target.id));
      after(async () => {
        await Promise.allSettled(
          notified.map((target) =>
            notifyForcedLogout({ to: target.email, name: target.name, by: actor.name ?? actor.email, reason: signOutReason.data || undefined })
          )
        );
      });
    }
  }

  revalidatePath(USERS_PATH);
  revalidatePath(SESSIONS_PATH);
  const note = skippedNote(plan.skipped, ids.length - found);
  if (plan.apply.length === 0) return fail(`Nothing changed.${note}`);
  return done(`${BULK_DONE[op](plan.apply.length)}${note}`);
}
