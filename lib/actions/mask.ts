"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction, type Authorized } from "@/lib/actions/guard";
import { done, fail, type ActionState } from "@/lib/actions/state";
import { audit } from "@/lib/admin/audit";
import { AUTH_SECRET } from "@/lib/auth/kit";
import { consumeChallenge, issueChallenge, verifyChallenge } from "@/lib/auth/mfa";
import { CODE_FAILURES, MFA_TTL_MINUTES, normalizeCode, readStepUp, signStepUp } from "@/lib/auth/mfa-rules";
import { SUPER_ROLE } from "@/lib/auth/permissions";
import { repos, withTx } from "@/lib/data";
import { getSetting, updateSetting } from "@/lib/settings/service";

// Developer masking (lib/auth/mask.ts), for developers only: anyone else gets
// the generic refusal, so the feature never confirms it exists. A change takes
// two steps after the browser's confirmation: the request emails a step-up
// code (purpose STEP_UP) bound to that exact change by a signed ticket, and
// only that code applies it. Codes and changes are audited, and rows a
// developer writes are for developers only.

const REFUSED = "You do not have permission to do that.";
const UNEXPECTED = "Something went wrong. Nothing was changed.";
const SCREENS = ["/admin/account", "/admin/users", "/admin/roles", "/admin/audit", "/admin"];

type Scope = "self" | "global";
interface MaskChange {
  scope: Scope;
  on: boolean;
}

const actionOf = (change: MaskChange) => `mask:${change.scope}:${change.on ? "on" : "off"}`;

function changeOf(action: string): MaskChange | null {
  const match = /^mask:(self|global):(on|off)$/.exec(action);
  return match ? { scope: match[1] as Scope, on: match[2] === "on" } : null;
}

async function developer(): Promise<Authorized> {
  const access = await authorizeAction(null);
  if (access.ok && access.user.role !== SUPER_ROLE) return { ok: false, error: REFUSED };
  return access;
}

async function isOn(scope: Scope, userId: string): Promise<boolean> {
  if (scope === "global") return (await getSetting("security.mask")).global;
  return (await repos.users.findProfile(userId))?.masked ?? false;
}

/** Step one, after the confirmation: emails a code that can only apply this change. */
export async function requestMaskChangeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await developer();
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const scope = formData.get("scope");
  if (scope !== "self" && scope !== "global") return fail(UNEXPECTED);
  const change: MaskChange = { scope, on: formData.get("on") === "true" };
  if ((await isOn(scope, user.id)) === change.on) return fail(change.on ? "Masking is already on." : "Masking is already off.");

  const issued = await issueChallenge({ userId: user.id, email: user.email, name: user.name, purpose: "STEP_UP" });
  if (!issued.ok) {
    return fail(
      issued.error === "limited"
        ? "Too many codes asked for. Wait a few minutes."
        : issued.error === "locked"
          ? "Too many wrong codes. Wait a few minutes."
          : "The code could not be emailed. Check the email settings."
    );
  }
  // The browser holds the ticket, never a bare challenge id: the code confirms this change only.
  const ticket = signStepUp(AUTH_SECRET, user.id, { challengeId: issued.challengeId, action: actionOf(change) });
  return done(`A code was sent to ${user.email}. It works for ${MFA_TTL_MINUTES} minutes.`, { challengeId: ticket });
}

/** Step two: the emailed code applies the change its ticket was signed for. */
export async function confirmMaskChangeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await developer();
  if (!access.ok) return fail(access.error);
  const { user } = access;

  const step = readStepUp(AUTH_SECRET, user.id, formData.get("challengeId"));
  const change = step ? changeOf(step.action) : null;
  if (!step || !change) return fail("Ask for a new code.");
  const code = normalizeCode(String(formData.get("code") ?? ""));
  if (!code) return fail("Enter the 6 digit code.", { code: "Enter the 6 digit code." });

  const result = await verifyChallenge({ challengeId: step.challengeId, userId: user.id, email: user.email, purpose: "STEP_UP", code });
  if (!result.ok) return fail(CODE_FAILURES[result.reason], { code: CODE_FAILURES[result.reason] });
  if (!(await consumeChallenge({ challengeId: step.challengeId, userId: user.id, purpose: "STEP_UP" }))) return fail(CODE_FAILURES.expired);

  try {
    if (change.scope === "global") {
      // updateSetting writes its audit row in the same transaction.
      await updateSetting("security.mask", { global: change.on }, user);
    } else {
      await withTx(async (tx) => {
        await tx.users.update(user.id, { masked: change.on });
        await audit(
          {
            action: change.on ? "user.mask.enabled" : "user.mask.disabled",
            actor: user,
            entityType: "User",
            entityId: user.id,
            meta: { verifiedBy: "email_code" },
          },
          tx
        );
      });
    }
  } catch {
    return fail(UNEXPECTED);
  }

  for (const path of SCREENS) revalidatePath(path);
  if (change.scope === "global") {
    return done(change.on ? "Every developer now shows as a super admin to everyone but developers." : "Developers are masked one by one again.");
  }
  return done(change.on ? "Everyone but developers now sees you as a super admin." : "Everyone sees you as a developer again.");
}
