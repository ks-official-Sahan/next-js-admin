import type { Prisma } from "@prisma/client";

import type { RoleName } from "@/lib/auth/permissions";

import type { SessionQuery, UserSessionRepo } from "../user-sessions";
import type { DbClient } from "./client";

const live = (now: Date): Prisma.UserSessionWhereInput => ({ revokedAt: null, expiresAt: { gt: now } });

/** Exported for tests: the filter and keyset condition the sessions screen sends to the database. */
export function sessionSearchWhere(query: Omit<SessionQuery, "limit">): Prisma.UserSessionWhereInput {
  const q = query.q?.trim();
  const and: Prisma.UserSessionWhereInput[] = [];
  if (query.userId) and.push({ userId: query.userId });
  if (query.status === "active") and.push(live(query.now));
  if (query.status === "ended") and.push({ OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: query.now } }] });
  if (q) {
    and.push({
      OR: [
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { ip: { contains: q } },
      ],
    });
  }
  if (query.after) {
    and.push({
      OR: [{ lastSeenAt: { lt: query.after.lastSeenAt } }, { lastSeenAt: query.after.lastSeenAt, id: { lt: query.after.id } }],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

export function userSessionRepo(client: DbClient): UserSessionRepo {
  return {
    async search(query) {
      // One extra row says whether another page exists, without a count.
      const rows = await client.userSession.findMany({
        where: sessionSearchWhere(query),
        orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: {
          id: true,
          userId: true,
          ip: true,
          browser: true,
          os: true,
          device: true,
          mfaVerified: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
          revokedAt: true,
          revokeReason: true,
          user: { select: { email: true, name: true, role: true } },
        },
      });
      const page = rows.slice(0, query.limit);
      const last = page[page.length - 1];
      return {
        items: page.map(({ user, ...row }) => ({ ...row, userEmail: user.email, userName: user.name, userRole: user.role as RoleName })),
        next: rows.length > query.limit && last ? { lastSeenAt: last.lastSeenAt, id: last.id } : null,
      };
    },
    async findManyWithOwner(ids) {
      if (ids.length === 0) return [];
      const rows = await client.userSession.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true, revokedAt: true, expiresAt: true, user: { select: { email: true, role: true } } },
      });
      return rows.map((row) => ({ ...row, user: { ...row.user, role: row.user.role as RoleName } }));
    },
    async listLiveForUsers(userIds, now) {
      if (userIds.length === 0) return [];
      return client.userSession.findMany({ where: { userId: { in: userIds }, ...live(now) }, select: { id: true, userId: true } });
    },
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
