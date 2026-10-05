import type { Prisma } from "@prisma/client";

import type { RoleName } from "@/lib/auth/permissions";

import type { AuthTokenRepo, AuthTokenRow } from "../auth-tokens";
import type { DbClient } from "./client";

const open = { usedAt: null, revokedAt: null } as const;
const asRow = <T extends { role: string | null }>(row: T) => ({ ...row, role: row.role as RoleName | null }) as T & AuthTokenRow;

export function authTokenRepo(client: DbClient): AuthTokenRepo {
  const revokeWhere = async (where: Prisma.AuthTokenWhereInput) => {
    const { count } = await client.authToken.updateMany({ where, data: { revokedAt: new Date() } });
    return count;
  };
  return {
    async findByHash(tokenHash) {
      const row = await client.authToken.findUnique({ where: { tokenHash } });
      return row && asRow(row);
    },
    async listOpenInvites(now) {
      const rows = await client.authToken.findMany({
        where: { purpose: "INVITE", ...open, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(asRow);
    },
    async findOpenInvite(id) {
      const row = await client.authToken.findFirst({ where: { id, purpose: "INVITE", ...open } });
      return row && asRow(row);
    },
    async create(input) {
      return asRow(await client.authToken.create({ data: input }));
    },
    async revoke(id) {
      await client.authToken.update({ where: { id }, data: { revokedAt: new Date() } });
    },
    revokeIfOpen(id) {
      return revokeWhere({ id, ...open });
    },
    async revokeOpenForUser(purpose, userId) {
      await revokeWhere({ purpose, userId, ...open });
    },
    async revokeOpenInvitesTo(email, { roles, createdById }) {
      await revokeWhere({ purpose: "INVITE", email, ...open, OR: [{ role: { in: [...roles] } }, { createdById }] });
    },
    async revokeOpenInvitesSentBy(userId) {
      await revokeWhere({ purpose: "INVITE", createdById: userId, ...open });
    },
    async revokeOpenInvitesSentByAny(userIds) {
      if (userIds.length === 0) return;
      await revokeWhere({ purpose: "INVITE", createdById: { in: userIds }, ...open });
    },
    async rotateOpenInvite(id, tokenHash, expiresAt) {
      const { count } = await client.authToken.updateMany({ where: { id, purpose: "INVITE", ...open }, data: { tokenHash, expiresAt } });
      return count;
    },
    async claim(id, now) {
      const { count } = await client.authToken.updateMany({ where: { id, ...open, expiresAt: { gt: now } }, data: { usedAt: now } });
      return count;
    },
    async deleteForUser(userId) {
      await client.authToken.deleteMany({ where: { OR: [{ userId }, { purpose: "INVITE", createdById: userId, usedAt: null }] } });
    },
    async deleteForUsers(userIds) {
      if (userIds.length === 0) return;
      await client.authToken.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { purpose: "INVITE", createdById: { in: userIds }, usedAt: null }] },
      });
    },
  };
}
