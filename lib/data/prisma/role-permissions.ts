import type { RolePermissionRepo } from "../role-permissions";
import type { DbClient } from "./client";

export function rolePermissionRepo(client: DbClient): RolePermissionRepo {
  return {
    countForRole(role) {
      return client.rolePermission.count({ where: { role } });
    },
    async grantMany(grants) {
      const { count } = await client.rolePermission.createMany({ data: grants, skipDuplicates: true });
      return count;
    },
    async rolesWith(permission) {
      const rows = await client.rolePermission.findMany({ where: { permission }, select: { role: true } });
      return rows.map((row) => row.role);
    },
  };
}
