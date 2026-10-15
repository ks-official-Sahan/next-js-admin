"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { authorizeAction } from "@/lib/actions/guard";
import { done, fail, type ActionState } from "@/lib/actions/state";
import { auditSafe } from "@/lib/admin/audit";
import { confirmPassword } from "@/lib/auth/confirm-password";
import { removeFactors } from "@/lib/auth/mfa";
import { SUPER_ROLE } from "@/lib/auth/permissions";
import { invalidateUserSessionState, revokeUserSessions } from "@/lib/auth/session-store";
import { authAdapter } from "@/lib/data";
import { notifyForcedLogout } from "@/lib/users/notify";
import { findUserRef } from "@/lib/users/service";

// A developer resets another person's sign-in methods: when a phone is lost,
// a security key is gone, or a device should no longer be trusted. Developers
// only, never on their own account (the account page covers that), and only
// after re-entering their password. Removing an authenticator app or a passkey
// signs the person out everywhere, because a session opened with the removed
// factor may be the very thing to stop. Recovery codes go with the last strong
// factor (auth-kit's removeFactors), and a DEVELOPER or SUPER_ADMIN left
// without one must set one up again before using the admin.

const REFUSED = "You do not have permission to do that.";
const USERS_PATH = "/admin/users";
const SESSIONS_PATH = "/admin/sessions";

async function developerOver(userId: unknown) {
  const access = await authorizeAction("manageUsers");
  if (!access.ok) return { ok: false as const, error: access.error };
  if (access.user.role !== SUPER_ROLE) return { ok: false as const, error: REFUSED };
  const target = typeof userId === "string" && userId ? await findUserRef(userId) : null;
  if (!target) return { ok: false as const, error: "That user does not exist." };
  if (target.id === access.user.id) return { ok: false as const, error: "Manage your own sign-in methods from your account page." };
  return { ok: true as const, actor: access.user, target };
}

export interface UserFactorsView {
  totp: boolean;
  emailCodes: boolean;
  recoveryCodesLeft: number;
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[];
}

export type UserFactorsResult = { ok: true; factors: UserFactorsView } | { ok: false; error: string };

/** One person's sign-in methods, for the user sheet. Loaded when the sheet opens, never for the whole list. */
export async function userFactorsAction(userId: string): Promise<UserFactorsResult> {
  const allowed = await developerOver(userId);
  if (!allowed.ok) return allowed;
  const [factors, passkeys] = await Promise.all([authAdapter.findMfaFactors(allowed.target.id), authAdapter.listPasskeys(allowed.target.id)]);
  if (!factors) return { ok: false, error: "That user does not exist." };
  await auditSafe({ action: "auth.mfa.inventory_viewed", actor: allowed.actor, entityType: "User", entityId: allowed.target.id });
  return {
    ok: true,
    factors: {
      totp: factors.totpEnabledAt !== null,
      emailCodes: factors.mfaEnabled,
      recoveryCodesLeft: factors.recoveryCodesLeft,
      passkeys: passkeys.map((passkey) => ({
        id: passkey.id,
        name: passkey.name,
        createdAt: passkey.createdAt.toISOString(),
        lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
      })),
    },
  };
}

const FACTORS = ["totp", "passkey", "recovery", "all"] as const;
type Factor = (typeof FACTORS)[number];

/** Removes the authenticator app, one passkey, the recovery codes, or every one of them. */
export async function removeUserFactorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const allowed = await developerOver(formData.get("userId"));
  if (!allowed.ok) return fail(allowed.error);
  const { actor, target } = allowed;

  // "totp", "recovery", "all", or "passkey:<credential id>".
  const choice = String(formData.get("target") ?? "");
  const [head, ...rest] = choice.split(":");
  const factor = FACTORS.find((value) => value === head) as Factor | undefined;
  const passkeyId = rest.join(":");
  if (!factor || (factor === "passkey") !== (passkeyId.length > 0)) return fail("Choose what to remove.");

  const confirmed = await confirmPassword(actor, formData.get("password"));
  if (!confirmed.ok) return fail(confirmed.error, { password: confirmed.error });

  const removed = await removeFactors(actor, {
    userId: target.id,
    totp: factor === "totp" || factor === "all",
    passkeyId: factor === "passkey" ? passkeyId : undefined,
    allPasskeys: factor === "all",
    recoveryCodes: factor === "recovery" || factor === "all",
  });
  // A stale sheet: nothing was there to remove, so nobody is signed out or emailed.
  if (!removed.totp && removed.passkeys === 0 && !removed.recoveryCodes) {
    revalidatePath(USERS_PATH);
    return done(`Nothing to remove: ${target.email} no longer has that sign-in method.`);
  }

  let signedOut = 0;
  if (removed.totp || removed.passkeys > 0) {
    const ended = await revokeUserSessions(target.id, { userId: actor.id, reason: "factors_removed" });
    signedOut = ended.length;
    if (signedOut > 0) {
      await auditSafe({
        action: "auth.session.revoked",
        actor,
        entityType: "User",
        entityId: target.id,
        meta: { sessions: signedOut, reason: "factors_removed", email: target.email },
      });
      after(() =>
        notifyForcedLogout({ to: target.email, name: target.name, by: actor.name ?? actor.email, reason: "Your sign-in methods were reset." })
      );
    }
  } else {
    // Recovery codes only: the sessions stay, the cached factor state does not.
    await invalidateUserSessionState(target.id);
  }

  revalidatePath(USERS_PATH);
  if (signedOut > 0) revalidatePath(SESSIONS_PATH);
  const what =
    factor === "all"
      ? "Every second factor was removed"
      : factor === "totp"
        ? "The authenticator app was removed"
        : factor === "passkey"
          ? "The passkey was removed"
          : "The recovery codes were removed";
  return done(`${what} for ${target.email}.${signedOut > 0 ? ` They were signed out of ${signedOut} ${signedOut === 1 ? "session" : "sessions"}.` : ""}`);
}
