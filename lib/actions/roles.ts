"use server";

import { revalidatePath } from "next/cache";

import { checkRoleInput } from "@sahan-sac/auth-kit/rbac/roles";

import { authorizeAction } from "@/lib/actions/guard";
import { done, fail, type ActionState } from "@/lib/actions/state";
import { audit } from "@/lib/admin/audit";
import { PERMISSIONS, SUPER_ROLE, isFixedRole, type Permission } from "@/lib/auth/permissions";
import { invalidateMatrix, loadMatrix, replaceMatrix } from "@/lib/auth/rbac";
import { diffMatrix, validateMatrix, type Matrix } from "@/lib/auth/rbac-rules";
import type { RoleCatalog } from "@/lib/auth/rbac-rules";
import { getRoleCatalog, invalidateRoles } from "@/lib/auth/roles";
import { withTx } from "@/lib/data";
import { UniqueViolation } from "@/lib/data/errors";

// Roles and the role by permission matrix. Only a holder of managePermissions
// reaches any of these: DEVELOPER and SUPER_ADMIN, whose permissions are fixed
// in code and never editable in the matrix (design notes, section 9). Roles
// are rows: adding one needs no deploy, and the rank decides who manages
// whom, here too: a SUPER_ADMIN changes only roles ranked below its own, and
// grants only permissions it holds.

const ROLES_PATH = "/admin/roles";
const USERS_PATH = "/admin/users";
const UNEXPECTED = "Something went wrong. Nothing was changed.";

/** The lowest rank the actor may give a role: any, for the super role; otherwise strictly below their own. */
function minRank(catalog: RoleCatalog, actorRole: string): number {
  if (actorRole === SUPER_ROLE) return 1;
  return (catalog.get(actorRole)?.rank ?? Number.POSITIVE_INFINITY) + 1;
}

/** Thrown inside a transaction to abort it with a message for the user. */
class Refused extends Error {}

/** After any role change: the cached role list, the matrix and every screen that names roles. */
async function refreshRoles(): Promise<void> {
  await Promise.all([invalidateRoles(), invalidateMatrix()]);
  revalidatePath(ROLES_PATH);
  revalidatePath(USERS_PATH);
}

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/**
 * Saves the matrix. Checkboxes are named `perm:<ROLE>:<permission>`; a box
 * that is not ticked is not sent, so the form describes the whole matrix for
 * every role it listed.
 */
export async function saveMatrix(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("managePermissions");
  if (!access.ok) return fail(access.error);

  // Read past the caches: the roles and the diff must describe what is stored right now.
  await Promise.all([invalidateRoles(), invalidateMatrix()]);
  const [catalog, before] = await Promise.all([getRoleCatalog(), loadMatrix()]);
  const editable = catalog.names.filter((role) => !isFixedRole(role));

  // Only the roles ranked below the actor change, and only in the permissions
  // the actor holds; everything else keeps what is stored (a locked box is
  // never sent, so its absence means nothing).
  const mayEdit = new Set(catalog.assignable(access.user.role));
  const holds = new Set<Permission>(access.user.permissions);
  const nextFor = (role: string): Set<Permission> => {
    const stored = new Set(before[role] ?? []);
    if (isFixedRole(role) || !mayEdit.has(role)) return stored;
    const kept = [...stored].filter((permission) => !holds.has(permission));
    const ticked = PERMISSIONS.filter((permission) => holds.has(permission) && formData.has(`perm:${role}:${permission}`));
    return new Set([...kept, ...ticked]);
  };
  const next: Matrix = Object.fromEntries(catalog.names.map((role) => [role, nextFor(role)]));

  const valid = validateMatrix(next);
  if (!valid.ok) return fail(valid.error);

  const changes = diffMatrix(before, next);
  if (changes.length === 0) return done("No changes to save.");

  const snapshot = (matrix: Matrix) => Object.fromEntries(editable.map((role) => [role, [...(matrix[role] ?? [])].sort()]));
  try {
    await replaceMatrix(next, access.user.id, {
      action: "rbac.matrix.updated",
      actor: access.user,
      entityType: "RolePermission",
      before: snapshot(before),
      after: snapshot(next),
      meta: { changes },
    });
  } catch {
    return fail(UNEXPECTED);
  }

  revalidatePath(ROLES_PATH);
  return done(`Saved ${changes.length} ${changes.length === 1 ? "change" : "changes"}. They apply within a minute.`);
}

export async function createRoleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("managePermissions");
  if (!access.ok) return fail(access.error);

  const catalog = await getRoleCatalog();
  const checked = checkRoleInput(
    { name: text(formData, "name"), label: text(formData, "label"), description: text(formData, "description"), rank: Number(text(formData, "rank")) },
    catalog.roles
  );
  if (!checked.ok) return fail("Check the form.", { [checked.field]: checked.error });
  const floor = minRank(catalog, access.user.role);
  if (checked.value.rank < floor) return fail("Check the form.", { rank: `Use a rank of ${floor} or more.` });
  const role = { ...checked.value, description: checked.value.description ?? null };

  try {
    await withTx(async (tx) => {
      await tx.roles.create(role);
      await audit({ action: "role.created", actor: access.user, entityType: "Role", entityId: role.name, after: role }, tx);
    });
  } catch (error) {
    if (error instanceof UniqueViolation) return fail("Check the form.", { name: "That role already exists." });
    return fail(UNEXPECTED);
  }

  await refreshRoles();
  return done(`Added ${role.label}. It has no permissions yet: tick them in the matrix below.`);
}

export async function updateRoleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("managePermissions");
  if (!access.ok) return fail(access.error);

  const name = text(formData, "role");
  const catalog = await getRoleCatalog();
  const current = catalog.get(name);
  if (!current || !catalog.assignable(access.user.role).includes(name)) return fail("You are not allowed to change this role.");

  // The super role keeps rank 0: it is the top of the hierarchy in code.
  const rank = name === SUPER_ROLE ? 1 : Number(text(formData, "rank"));
  const checked = checkRoleInput({ name, label: text(formData, "label"), description: text(formData, "description"), rank }, catalog.roles, name);
  if (!checked.ok) return fail("Check the form.", { [checked.field]: checked.error });
  const floor = minRank(catalog, access.user.role);
  if (name !== SUPER_ROLE && checked.value.rank < floor) return fail("Check the form.", { rank: `Use a rank of ${floor} or more.` });
  const patch = {
    label: checked.value.label,
    description: checked.value.description ?? null,
    rank: name === SUPER_ROLE ? current.rank : checked.value.rank,
  };

  try {
    await withTx(async (tx) => {
      await tx.roles.update(name, patch);
      await audit(
        {
          action: "role.updated",
          actor: access.user,
          entityType: "Role",
          entityId: name,
          before: { label: current.label, description: current.description, rank: current.rank },
          after: patch,
        },
        tx
      );
    });
  } catch {
    return fail(UNEXPECTED);
  }

  await refreshRoles();
  return done(`Saved ${patch.label}.`);
}

export async function deleteRoleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const access = await authorizeAction("managePermissions");
  if (!access.ok) return fail(access.error);

  const name = text(formData, "role");
  if (!(await getRoleCatalog()).assignable(access.user.role).includes(name)) return fail("You are not allowed to change this role.");
  try {
    const deleted = await withTx(async (tx) => {
      const role = await tx.roles.find(name);
      if (!role) throw new Refused("That role no longer exists.");
      if (role.system) throw new Refused("Built-in roles cannot be deleted.");
      const holders = await tx.roles.countUsers(name);
      if (holders > 0) {
        throw new Refused(`${holders} ${holders === 1 ? "user still has" : "users still have"} this role. Give them another role first.`);
      }
      // An open invitation must never turn into a different role once this one is gone.
      const invites = await tx.authTokens.revokeOpenInvitesForRole(name);
      await tx.roles.delete(name);
      await audit({ action: "role.deleted", actor: access.user, entityType: "Role", entityId: name, before: role, meta: { invitesRevoked: invites } }, tx);
      return role;
    });
    await refreshRoles();
    return done(`Deleted ${deleted.label}.`);
  } catch (error) {
    return fail(error instanceof Refused ? error.message : UNEXPECTED);
  }
}
