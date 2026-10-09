// The generic RBAC engine's types and matrix/rbac factories.
export type { Matrix, MatrixChange, MatrixCheck, PermissionRow } from "@sahan-sac/auth-kit/rbac";
export { createRbac } from "@sahan-sac/auth-kit/rbac";

// The app's own catalogue (lib/auth/kit-config.ts), including
// isPermission/isRole/defaultPermissionsFor/canBeGranted bound to authKit so
// existing call sites keep their single-argument calling convention.
export {
  DEFAULT_GRANTS,
  FIXED_GRANTS,
  MASK_ROLE,
  NEVER_GRANTABLE,
  PERMISSIONS,
  PERMISSION_ADDED_IN,
  PERMISSION_INFO,
  PERMISSION_SPLIT_FROM,
  RBAC_SEED_VERSION,
  ROLES,
  SUPER_ROLE,
  SYSTEM_ROLE_RANKS,
  SYSTEM_ROLE_ROWS,
  canBeGranted,
  defaultPermissionsFor,
  isFixedRole,
  isPermission,
  isRole,
} from "./kit-config";
export type { Permission, PermissionGroup, PermissionInfo, RoleName, SystemRole } from "./kit-config";
