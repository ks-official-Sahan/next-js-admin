import { eq } from "drizzle-orm";

import { rolePermissions } from "@/lib/db/schema";

import type { RolePermissionRepo } from "../role-permissions";
import { countRows, type DbClient } from "./client";

export function rolePermissionRepo(client: DbClient): RolePermissionRepo {
  return {
    countForRole(role) {
      return countRows(client, rolePermissions, eq(rolePermissions.role, role));
    },
    async grantMany(grants) {
      if (grants.length === 0) return 0;
      const rows = await client.insert(rolePermissions).values(grants).onConflictDoNothing().returning({ role: rolePermissions.role });
      return rows.length;
    },
    async rolesWith(permission) {
      const rows = await client.select({ role: rolePermissions.role }).from(rolePermissions).where(eq(rolePermissions.permission, permission));
      return rows.map((row) => row.role);
    },
  };
}
