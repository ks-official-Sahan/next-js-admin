import type { Prisma } from "@prisma/client";

import type { RoleName } from "@/lib/auth/permissions";

import type { PresentRoles, UserListItem, UserPage, UserQuery, UserRepo, UserStatusFilter } from "../users";
import type { DbClient } from "./client";
import { table } from "./raw";

const ref = { id: true, email: true, name: true, role: true, disabledAt: true } as const;
const asRole = <T extends { role: string }>(row: T) => ({ ...row, role: row.role as RoleName });

/** The users screen's columns, with live sessions counted in the same query (no N+1). */
const listSelect = (now: Date) =>
  ({
    id: true,
    email: true,
    name: true,
    role: true,
    masked: true,
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

/**
 * The accounts a viewer who does not see through masks finds under `role`:
 * masked super-role accounts count as the mask role, never as their own.
 */
export function presentedRoleWhere(role: RoleName, present: PresentRoles): Prisma.UserWhereInput {
  const masked: Prisma.UserWhereInput = present.global ? { role: present.superRole } : { role: present.superRole, masked: true };
  if (role === present.maskAs) return { OR: [{ role }, masked] };
  if (role === present.superRole) return present.global ? { id: { in: [] } } : { role, masked: false };
  return { role };
}

/** Exported for tests: the filter the users screen sends to the database. */
export function userSearchWhere(query: Pick<UserQuery, "q" | "role" | "status" | "present">): Prisma.UserWhereInput {
  const q = query.q?.trim();
  const role = query.role ? (query.present ? { AND: [presentedRoleWhere(query.role, query.present)] } : { role: query.role }) : {};
  return {
    ...(q
      ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
      : {}),
    ...role,
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
      return [{ role: dir }, { email: "asc" }];
    case "last-login":
      return [{ lastLoginAt: { sort: dir, nulls: "last" } }, { id: dir }];
    case "created":
      return [{ createdAt: dir }, { id: dir }];
    default:
      return [{ disabledAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }, { id: "asc" }];
  }
}

type ListRow = Prisma.UserGetPayload<{ select: ReturnType<typeof listSelect> }>;
const toListItem = ({ _count, ...row }: ListRow): UserListItem => ({ ...asRole(row), activeSessions: _count.sessions });

/**
 * Sorting by role for a viewer who sees masked accounts under another role.
 * No column holds the role shown, so each shown role is one group: every
 * group is counted at once, then only the groups this page covers are read,
 * by email, as the plain role sort orders ties.
 */
async function searchByPresentedRole(client: DbClient, query: UserQuery, present: PresentRoles): Promise<UserPage> {
  const base = userSearchWhere({ q: query.q, status: query.status });
  const names = (query.role ? [query.role] : present.roles.filter((role) => !(present.global && role === present.superRole))).toSorted((a, b) =>
    query.dir === "desc" ? b.localeCompare(a) : a.localeCompare(b)
  );
  const groups = names.map((role): Prisma.UserWhereInput => ({ AND: [base, presentedRoleWhere(role, present)] }));
  const counts = await Promise.all(groups.map((where) => client.user.count({ where })));

  const now = new Date();
  const reads: Array<Promise<ListRow[]>> = [];
  let skip = query.offset;
  let take = query.limit;
  for (const [index, where] of groups.entries()) {
    const count = counts[index] ?? 0;
    if (take <= 0) break;
    if (skip >= count) {
      skip -= count;
      continue;
    }
    const rows = Math.min(take, count - skip);
    reads.push(client.user.findMany({ where, orderBy: [{ email: "asc" }], skip, take: rows, select: listSelect(now) }));
    take -= rows;
    skip = 0;
  }
  const pages = await Promise.all(reads);
  return { items: pages.flat().map(toListItem), total: counts.reduce((sum, count) => sum + count, 0) };
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
      return client.user.findUnique({ where: { id }, select: { name: true, bio: true, mfaEnabled: true, masked: true, lastLoginAt: true } });
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
      return rows.map(toListItem);
    },
    async search(query) {
      if (query.sort === "role" && query.present) return searchByPresentedRole(client, query, query.present);
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
      return { items: rows.map(toListItem), total };
    },
    maskFlags(role) {
      return client.user.findMany({ where: { role }, select: { id: true, masked: true } });
    },
    count() {
      return client.user.count();
    },
    countActiveDevelopers() {
      return client.user.count({ where: { role: "DEVELOPER", disabledAt: null } });
    },
    async lockActiveDevelopers() {
      await client.$queryRaw`SELECT id FROM ${table("users")} WHERE role = 'DEVELOPER' FOR UPDATE`;
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
