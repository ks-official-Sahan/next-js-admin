"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { auditMany, auditSafe } from "@/lib/admin/audit";
import { authorizeAction } from "@/lib/actions/guard";
import { done, fail, formValues, type ActionState } from "@/lib/actions/state";
import { canManage } from "@/lib/auth/rbac-rules";
import { forceLogoutAll, revokeSession, revokeSessions, revokeUserSessions } from "@/lib/auth/session-store";
import { repos } from "@/lib/data";
import { log } from "@/lib/log";
import { notifyForcedLogout } from "@/lib/users/notify";
import { findUserRef } from "@/lib/users/service";

// Ending other people's sessions. Revoking one session needs `revokeSessions`,
// ending all of a user's needs `forceLogout`, and both respect who may manage
// whom. Ending everyone's is for a DEVELOPER only, and keeps the caller signed
// in unless they ask otherwise (design notes, section 6.4).

const SESSIONS_PATH = "/admin/sessions";
const reason = z.string().trim().max(200, "Use at most 200 characters.");

export async function revokeSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("revokeSessions");
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const sid = formData.get("sessionId");
  if (typeof sid !== "string" || !sid) return fail("Missing session.");
  if (sid === user.sid) return fail("Use Sign out to end your current session.");

  const session = await repos.sessions.findWithOwner(sid);
  if (!session) return fail("That session does not exist.");
  // Your own other sessions are always yours to end. Anyone else's follows the hierarchy.
  const own = session.userId === user.id;
  if (!own && !canManage(user, { id: session.userId, role: session.user.role })) {
    return fail("You are not allowed to end this session.");
  }

  const ended = await revokeSession(sid, { userId: user.id, reason: "revoked_by_admin" });
  if (ended) {
    // Session store mutation, not a DB transaction this file controls: an
    // audit write failure here must not turn a successful revoke into a
    // reported failure, so this uses auditSafe (logs and never throws).
    await auditSafe({
      action: "auth.session.revoked",
      actor: user,
      entityType: "UserSession",
      entityId: sid,
      meta: { userId: session.userId, email: session.user.email },
    });
  }
  revalidatePath(SESSIONS_PATH);
  return done(ended ? "Session ended. That device is signed out on its next request." : "That session had already ended.");
}

const BULK_MAX = 100;
/** Row ids are cuids; anything else in a selection is dropped before it reaches a query. */
const ROW_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Ends the selected sessions: the same reach as ending one (your own other
 * sessions, or the sessions of people you manage, never the current one),
 * read in one query and ended in one write. Sessions out of reach or already
 * ended are skipped and counted in the result.
 */
export async function endSessions(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("revokeSessions");
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const ids = [...new Set(formData.getAll("ids").filter((id): id is string => typeof id === "string" && ROW_ID.test(id)))];
  if (ids.length === 0) return fail("Select at least one session.");
  if (ids.length > BULK_MAX) return fail(`Select at most ${BULK_MAX} sessions at a time.`);

  const now = Date.now();
  const rows = await repos.sessions.findManyWithOwner(ids);
  const allowed = rows.filter(
    (row) =>
      row.id !== user.sid &&
      !row.revokedAt &&
      row.expiresAt.getTime() > now &&
      (row.userId === user.id || canManage(user, { id: row.userId, role: row.user.role }))
  );
  const skipped = ids.length - allowed.length;
  if (allowed.length === 0) {
    return fail("None of those sessions can be ended: they already ended, include this device, or belong to someone you do not manage.");
  }

  await revokeSessions(
    allowed.map((row) => row.id),
    { userId: user.id, reason: "revoked_by_admin" }
  );
  // The sessions are already ended; a failed audit write must not report that as a failure.
  await auditMany(
    allowed.map((row) => ({
      action: "auth.session.revoked",
      actor: user,
      entityType: "UserSession",
      entityId: row.id,
      meta: { userId: row.userId, email: row.user.email, bulk: true },
    }))
  ).catch((error: unknown) => log.error("audit write failed", { action: "auth.session.revoked", error: (error as Error).message }));

  revalidatePath(SESSIONS_PATH);
  revalidatePath("/admin/users");
  const count = `${allowed.length} ${allowed.length === 1 ? "session" : "sessions"}`;
  return done(
    `Ended ${count}. Those devices are signed out on their next request.${skipped > 0 ? ` ${skipped} skipped: already ended, this device, or out of your reach.` : ""}`
  );
}

export async function forceLogoutUser(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("forceLogout");
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const parsed = reason.safeParse(formValues(formData).reason ?? "");
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the reason.");

  const id = formData.get("userId");
  const target = typeof id === "string" && id ? await findUserRef(id) : null;
  if (!target) return fail("That user does not exist.");
  if (!canManage(user, target)) return fail("You are not allowed to sign this user out.");

  const ended = await revokeUserSessions(target.id, { userId: user.id, reason: "force_logout" });
  await auditSafe({
    action: "auth.session.force_logout",
    actor: user,
    entityType: "User",
    entityId: target.id,
    meta: { email: target.email, sessions: ended.length, reason: parsed.data || undefined },
  });
  if (ended.length > 0) {
    after(() =>
      notifyForcedLogout({ to: target.email, name: target.name, by: user.name ?? user.email, reason: parsed.data || undefined })
    );
  }

  revalidatePath(SESSIONS_PATH);
  return done(
    ended.length > 0
      ? `${target.email} was signed out of ${ended.length} ${ended.length === 1 ? "session" : "sessions"}.`
      : `${target.email} had no open sessions.`
  );
}

export async function forceLogoutEveryone(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("forceLogout");
  if (!access.ok) return fail(access.error);
  const { user } = access;
  if (user.role !== "DEVELOPER") return fail("Only a developer can sign everyone out.");

  const parsed = reason.safeParse(formValues(formData).reason ?? "");
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the reason.");
  const includeMine = formData.get("includeMine") === "on";

  const result = await forceLogoutAll(
    { userId: user.id, reason: "force_logout_all" },
    { exceptUserId: includeMine ? undefined : user.id }
  );
  await auditSafe({
    action: "auth.session.force_logout",
    actor: user,
    entityType: "User",
    meta: { scope: "everyone", sessions: result.sessions, users: result.users, includeMine, reason: parsed.data || undefined },
  });

  if (result.userIds.length > 0) {
    const affected = await repos.users.findRefs(result.userIds);
    after(async () => {
      await Promise.allSettled(
        affected.map((person) =>
          notifyForcedLogout({ to: person.email, name: person.name, by: user.name ?? user.email, reason: parsed.data || undefined })
        )
      );
    });
  }

  revalidatePath(SESSIONS_PATH);
  return done(`Ended ${result.sessions} ${result.sessions === 1 ? "session" : "sessions"} of ${result.users} ${result.users === 1 ? "user" : "users"}.`);
}
