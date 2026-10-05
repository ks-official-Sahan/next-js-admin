import type { Prisma } from "@prisma/client";

import type { RoleName } from "@/lib/auth/permissions";

import type { UserQuery, UserRepo, UserStatusFilter } from "../users";
import type { DbClient } from "./client";

const ref = { id: true, email: true, name: true, role: true, disabledAt: true } as const;
const asRole = <T extends { role: string }>(row: T) => ({ ...row, role: row.role as RoleName });

/** The users screen's columns, with live sessions counted in the same query (no N+1). */
const listSelect = (now: Date) =>
  ({
    id: true,
    email: true,
    name: true,
    role: true,
    mfaEnabled: true,
    mustChangePassword: true,
    lastLoginAt: true,
    createdAt: true,
    disabledAt: true,
    _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: now } } } } },
  }) as const;

const STATUS_WHERE: Record<UserStatusFilter, Prisma.UserWhereInput> = {
  active: { disabledAt: null },
  disabled: { disabledAt: { not: null } },
  "must-change": { mustChangePassword: true },
  "two-factor": { mfaEnabled: true },
  "no-two-factor": { mfaEnabled: false },
};

/** Exported for tests: the filter the users screen sends to the database. */
export function userSearchWhere(query: Pick<UserQuery, "q" | "role" | "status">): Prisma.UserWhereInput {
  const q = query.q?.trim();
  return {
    ...(q
      ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
      : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? STATUS_WHERE[query.status] : {}),
  };
}

/** Exported for tests. Every order ends on a unique key, so paging is stable when the sort key ties. */
export function userSearchOrder({ sort, dir }: Pick<UserQuery, "sort" | "dir">): Prisma.UserOrderByWithRelationInput[] {
  switch (sort) {
    case "name":
      return [{ name: { sort: dir, nulls: "last" } }, { email: dir }];
    case "email":
      return [{ email: dir }];
    case "role":
      // Postgres sorts an enum in declaration order: DEVELOPER, MANAGER, EDITOR.
      return [{ role: dir }, { email: "asc" }];
    case "last-login":
      return [{ lastLoginAt: { sort: dir, nulls: "last" } }, { id: dir }];
    case "created":
      return [{ createdAt: dir }, { id: dir }];
    default:
      return [{ disabledAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }, { id: "asc" }];
  }
}

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
    async listWithLiveSessions(now) {
      const rows = await client.user.findMany({
        where: { sessions: { some: { revokedAt: null, expiresAt: { gt: now } } } },
        orderBy: { email: "asc" },
        select: ref,
      });
      return rows.map(asRole);
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
        select: listSelect(new Date()),
      });
      return rows.map(({ _count, ...row }) => ({ ...asRole(row), activeSessions: _count.sessions }));
    },
    async search(query) {
      const where = userSearchWhere(query);
      // The page and the total in parallel: two reads, one round trip of latency.
      const [rows, total] = await Promise.all([
        client.user.findMany({
          where,
          orderBy: userSearchOrder(query),
          skip: query.offset,
          take: query.limit,
          select: listSelect(new Date()),
        }),
        client.user.count({ where }),
      ]);
      return { items: rows.map(({ _count, ...row }) => ({ ...asRole(row), activeSessions: _count.sessions })), total };
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
    async updateMany(ids, patch) {
      if (ids.length === 0) return;
      await client.user.updateMany({ where: { id: { in: ids } }, data: patch });
    },
    async delete(id) {
      await client.user.delete({ where: { id } });
    },
    async deleteMany(ids) {
      if (ids.length === 0) return;
      await client.user.deleteMany({ where: { id: { in: ids } } });
    },
  };
}
