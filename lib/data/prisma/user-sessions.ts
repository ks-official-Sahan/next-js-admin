import type { RoleName } from "@/lib/auth/permissions";

import type { UserSessionRepo } from "../user-sessions";
import type { DbClient } from "./client";

export function userSessionRepo(client: DbClient): UserSessionRepo {
  return {
    async findWithOwner(id) {
      const row = await client.userSession.findUnique({
        where: { id },
        select: { id: true, userId: true, user: { select: { email: true, role: true } } },
      });
      return row && { ...row, user: { ...row.user, role: row.user.role as RoleName } };
    },
    async isOwnedBy(id, userId) {
      return (await client.userSession.findFirst({ where: { id, userId }, select: { id: true } })) !== null;
    },
    async listIdsForUser(userId) {
      return (await client.userSession.findMany({ where: { userId }, select: { id: true } })).map((row) => row.id);
    },
    async markMfaVerified(id) {
      await client.userSession.update({ where: { id }, data: { mfaVerified: true } });
    },
  };
}
