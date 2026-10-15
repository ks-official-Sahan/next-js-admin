import "server-only";

import { createAuthDal, type AuthUser as PackageAuthUser } from "@sahan-sac/auth-kit/session";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";

import { checkPasswordFingerprint, sessionSource } from "./engine";
import { authKit, type Permission, type RoleName } from "./kit-config";
import { getRolePermissions } from "./rbac";
import { getSessionState, touchSession } from "./session-store";

// Data access layer: the one place that decides who is signed in.

const dal = createAuthDal({
  auth: sessionSource,
  checkPasswordFingerprint,
  getSessionState,
  touchSession,
  // createRbac (./rbac) is bound to this app's concrete RoleName/Permission
  // union, narrower than createAuthDal's generic (role: string) => ...
  // parameter; every role it is ever called with does come from that same
  // union (there is only one caller, session/state.ts's evaluated state), so
  // this boundary cast is safe.
  getRolePermissions: getRolePermissions as (role: string) => Promise<readonly string[]>,
  notFound,
  redirect,
  after,
  expirePath: authKit.paths.expire,
  accountPasswordChangePath: authKit.paths.accountPasswordChange,
  strongMfaRoles: authKit.strongMfaRoles,
  mfaSetupPath: authKit.paths.mfaSetup,
});

/** Same shape as the package's `AuthUser`, with `role`/`permissions` narrowed to this app's own catalogue. */
export interface AuthUser extends Omit<PackageAuthUser, "role" | "permissions"> {
  role: RoleName;
  permissions: readonly Permission[];
}

export const getOptionalUser = dal.getOptionalUser as () => Promise<AuthUser | null>;
export const requireUser = dal.requireUser as (options?: { allowPasswordChange?: boolean; allowMfaSetup?: boolean }) => Promise<AuthUser>;
export const getSessionStatus = dal.getSessionStatus;
/**
 * A user who must still set up an authenticator app or passkey holds no
 * permission until they do: this is what keeps the admin API routes and
 * per-item checks closed to them, as requireUser keeps the pages closed.
 */
export const hasPermission = (user: Pick<AuthUser, "permissions" | "mfaSetupRequired">, permission: Permission): boolean =>
  !user.mfaSetupRequired && dal.hasPermission(user, permission);
export const requirePermission = dal.requirePermission as (
  permission: Permission,
  options?: { allowPasswordChange?: boolean; allowMfaSetup?: boolean }
) => Promise<AuthUser>;
