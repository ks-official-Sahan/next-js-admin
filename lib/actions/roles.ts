"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/actions/guard";
import { done, fail, type ActionState } from "@/lib/actions/state";
import { invalidateMatrix, loadMatrix, replaceMatrix } from "@/lib/auth/rbac";
import { diffMatrix, validateMatrix, type Matrix } from "@/lib/auth/rbac-rules";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";

// Saves the role by permission matrix. Checkboxes are named
// `perm:<ROLE>:<permission>`; a box that is not ticked is not sent, so the form
// describes the whole matrix. DEVELOPER is not editable: it holds everything in
// code (design notes, section 9).

export async function saveMatrix(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("managePermissions");
  if (!access.ok) return fail(access.error);

  const submitted = (role: "MANAGER" | "EDITOR"): Set<Permission> =>
    new Set(PERMISSIONS.filter((permission) => formData.has(`perm:${role}:${permission}`)));
  const next: Matrix = {
    DEVELOPER: new Set(PERMISSIONS),
    MANAGER: submitted("MANAGER"),
    EDITOR: submitted("EDITOR"),
  };

  const valid = validateMatrix(next);
  if (!valid.ok) return fail(valid.error);

  // Read past the cache: the diff must describe what is stored right now.
  await invalidateMatrix();
  const before = await loadMatrix();
  const changes = diffMatrix(before, next);
  if (changes.length === 0) return done("No changes to save.");

  try {
    await replaceMatrix(next, access.user.id, {
      action: "rbac.matrix.updated",
      actor: access.user,
      entityType: "RolePermission",
      before: Object.fromEntries((["MANAGER", "EDITOR"] as const).map((role) => [role, [...before[role]].sort()])),
      after: Object.fromEntries((["MANAGER", "EDITOR"] as const).map((role) => [role, [...next[role]].sort()])),
      meta: { changes },
    });
  } catch {
    return fail("Something went wrong. Nothing was changed.");
  }

  revalidatePath("/admin/roles");
  return done(`Saved ${changes.length} ${changes.length === 1 ? "change" : "changes"}. They apply within a minute.`);
}
