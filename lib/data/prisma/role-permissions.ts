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
  };
}
