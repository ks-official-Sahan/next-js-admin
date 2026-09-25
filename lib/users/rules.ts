import { assignableRoles, canManage, type Person } from "@/lib/auth/rbac-rules";
import type { RoleName } from "@/lib/auth/permissions";

// Business rules for changing users, kept apart from the database so they are
// unit tested: nobody changes themselves, MANAGER reaches EDITORs only, and the
// last enabled DEVELOPER can never be demoted, disabled or deleted
// (design notes, section 6.5).

export type Check = { ok: true } | { ok: false; error: string };

const ok: Check = { ok: true };
const refuse = (error: string): Check => ({ ok: false, error });

export interface Subject extends Person {
  disabled: boolean;
}

/** `activeDevelopers` counts enabled DEVELOPER accounts, the target included. */
interface Context {
  actor: Person;
  target: Subject;
  activeDevelopers: number;
}

function loosesLastDeveloper({ target, activeDevelopers }: Context): boolean {
  return target.role === "DEVELOPER" && !target.disabled && activeDevelopers <= 1;
}

function manage({ actor, target }: Context): Check {
  if (actor.id === target.id) return refuse("You cannot change your own account here.");
  if (!canManage(actor, target)) return refuse("You are not allowed to manage this user.");
  return ok;
}

export function checkChangeRole(context: Context & { newRole: RoleName }): Check {
  const denied = manage(context);
  if (!denied.ok) return denied;
  if (context.newRole === context.target.role) return refuse("The user already has that role.");
  if (!assignableRoles(context.actor.role).includes(context.newRole)) {
    return refuse("You are not allowed to give that role.");
  }
  if (loosesLastDeveloper(context)) return refuse("The last developer cannot be demoted.");
  return ok;
}

export function checkSetDisabled(context: Context & { disabled: boolean }): Check {
  const denied = manage(context);
  if (!denied.ok) return denied;
  if (context.disabled === context.target.disabled) {
    return refuse(context.disabled ? "The user is already disabled." : "The user is already enabled.");
  }
  if (context.disabled && loosesLastDeveloper(context)) return refuse("The last developer cannot be disabled.");
  return ok;
}

export function checkDelete(context: Context): Check {
  const denied = manage(context);
  if (!denied.ok) return denied;
  if (context.actor.role !== "DEVELOPER") return refuse("Only a developer can delete users.");
  if (loosesLastDeveloper(context)) return refuse("The last developer cannot be deleted.");
  return ok;
}

/** Sending a reset link: same reach as managing, and only for an enabled user. */
export function checkReset(context: Context): Check {
  const denied = manage(context);
  if (!denied.ok) return denied;
  if (context.target.disabled) return refuse("Enable the user before sending a reset link.");
  return ok;
}

/** Inviting or creating a user with a role. */
export function checkInvite(actor: Person, role: RoleName): Check {
  if (!assignableRoles(actor.role).includes(role)) return refuse("You are not allowed to give that role.");
  return ok;
}
