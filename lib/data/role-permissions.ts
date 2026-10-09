import type { RoleName } from "@/lib/auth/permissions";

/** Writes for the role permission seed. Runtime RBAC reads go through auth-kit's adapter. */
export interface RolePermissionRepo {
  countForRole(role: RoleName): Promise<number>;
  /** Grants each pair, skipping ones already granted; returns how many were new. */
  grantMany(grants: Array<{ role: RoleName; permission: string }>): Promise<number>;
  /** Every role holding the permission. */
  rolesWith(permission: string): Promise<RoleName[]>;
}
