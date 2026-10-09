"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/actions/guard";
import { done, fail, type ActionState } from "@/lib/actions/state";
import { audit } from "@/lib/admin/audit";
import { SUPER_ROLE } from "@/lib/auth/permissions";
import { withTx } from "@/lib/data";
import { updateSetting } from "@/lib/settings/service";

// Developer masking toggles (lib/auth/mask.ts), for developers only: anyone
// else gets the generic refusal, so the feature never confirms it exists.
// Both are audited, and rows a developer writes are for developers only.

const REFUSED = "You do not have permission to do that.";
const SCREENS = ["/admin/account", "/admin/users", "/admin/roles", "/admin/audit", "/admin"];

function refresh(): void {
  for (const path of SCREENS) revalidatePath(path);
}

export async function setOwnMaskAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction(null);
  if (!access.ok) return fail(access.error);
  if (access.user.role !== SUPER_ROLE) return fail(REFUSED);

  const masked = formData.get("masked") === "on";
  try {
    await withTx(async (tx) => {
      await tx.users.update(access.user.id, { masked });
      await audit({ action: masked ? "user.mask.enabled" : "user.mask.disabled", actor: access.user, entityType: "User", entityId: access.user.id }, tx);
    });
  } catch {
    return fail("Something went wrong. Nothing was changed.");
  }
  refresh();
  return done(masked ? "Everyone but developers now sees you as a super admin." : "Everyone sees you as a developer again.");
}

export async function setGlobalMaskAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction(null);
  if (!access.ok) return fail(access.error);
  if (access.user.role !== SUPER_ROLE) return fail(REFUSED);

  const global = formData.get("global") === "on";
  try {
    // updateSetting writes the audit row in the same transaction.
    await updateSetting("security.mask", { global }, access.user);
  } catch {
    return fail("Something went wrong. Nothing was changed.");
  }
  refresh();
  return done(global ? "Every developer now shows as a super admin to everyone but developers." : "Developers are masked one by one again.");
}
