import type { RoleName } from "@/lib/auth/permissions";

import type { UserRepo } from "../users";
import type { DbClient } from "./client";

const ref = { id: true, email: true, name: true, role: true, disabledAt: true } as const;
const asRole = <T extends { role: string }>(row: T) => ({ ...row, role: row.role as RoleName });

export function userRepo(client: DbClient): UserRepo {
  return {
    async findAccessState(id) {
      const row = await client.user.findUnique({ where: { id }, select: { id: true, role: true, disabledAt: true } });
      return row && asRole(row);
    },
    async findRef(id) {
      const row = await client.user.findUnique({ where: { id }, select: ref });
      return row && asRole(row);
    },
    async findRefByEmail(email) {
      const row = await client.user.findUnique({ where: { email }, select: ref });
      return row && asRole(row);
    },
    async findRefs(ids) {
      if (ids.length === 0) return [];
      const rows = await client.user.findMany({ where: { id: { in: ids } }, select: ref });
      return rows.map(asRole);
    },
    async existsByEmail(email) {
      return (await client.user.findUnique({ where: { email }, select: { id: true } })) !== null;
    },
    findProfile(id) {
      return client.user.findUnique({ where: { id }, select: { name: true, bio: true, mfaEnabled: true, lastLoginAt: true } });
    },
    async findPasswordHash(id) {
      return (await client.user.findUnique({ where: { id }, select: { passwordHash: true } }))?.passwordHash ?? null;
    },
    findSecurityStatus(id) {
      return client.user.findUnique({ where: { id }, select: { mfaEnabled: true, mustChangePassword: true } });
    },
    async list() {
      const rows = await client.user.findMany({
        orderBy: [{ disabledAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          mfaEnabled: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
          disabledAt: true,
          _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
        },
      });
      return rows.map(({ _count, ...row }) => ({ ...asRole(row), activeSessions: _count.sessions }));
    },
    count() {
      return client.user.count();
    },
    countActiveDevelopers() {
      return client.user.count({ where: { role: "DEVELOPER", disabledAt: null } });
    },
    async lockActiveDevelopers() {
      await client.$queryRaw`SELECT id FROM users WHERE role = 'DEVELOPER' FOR UPDATE`;
      return client.user.count({ where: { role: "DEVELOPER", disabledAt: null } });
    },
    create(input) {
      return client.user.create({ data: input, select: { id: true } });
    },
    async update(id, patch) {
      await client.user.update({ where: { id }, data: patch });
    },
    async delete(id) {
      await client.user.delete({ where: { id } });
    },
  };
}
