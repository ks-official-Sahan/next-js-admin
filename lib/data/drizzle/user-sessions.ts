import { and, desc, eq, gt, ilike, inArray, isNotNull, isNull, like, lt, lte, or, type SQL } from "drizzle-orm";

import { users, userSessions } from "@/lib/db/schema";

import type { SessionQuery, UserSessionRepo } from "../user-sessions";
import { containsPattern, first, type DbClient } from "./client";

const live = (now: Date) => and(isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now));

/** Exported for tests: the filter and keyset condition the sessions screen sends to the database. */
export function sessionSearchWhere(query: Omit<SessionQuery, "limit">): SQL | undefined {
  const q = query.q?.trim();
  const after = query.after;
  return and(
    query.userId ? eq(userSessions.userId, query.userId) : undefined,
    query.status === "active" ? live(query.now) : undefined,
    query.status === "ended" ? or(isNotNull(userSessions.revokedAt), lte(userSessions.expiresAt, query.now)) : undefined,
    q ? or(ilike(users.email, containsPattern(q)), ilike(users.name, containsPattern(q)), like(userSessions.ip, containsPattern(q))) : undefined,
    after
      ? or(lt(userSessions.lastSeenAt, after.lastSeenAt), and(eq(userSessions.lastSeenAt, after.lastSeenAt), lt(userSessions.id, after.id)))
      : undefined
  );
}

export function userSessionRepo(client: DbClient): UserSessionRepo {
  return {
    async findWithOwner(id) {
      return first(
        await client
          .select({ id: userSessions.id, userId: userSessions.userId, user: { email: users.email, role: users.role } })
          .from(userSessions)
          .innerJoin(users, eq(users.id, userSessions.userId))
          .where(eq(userSessions.id, id))
          .limit(1)
      );
    },
    async isOwnedBy(id, userId) {
      const rows = await client
        .select({ id: userSessions.id })
        .from(userSessions)
        .where(and(eq(userSessions.id, id), eq(userSessions.userId, userId)))
        .limit(1);
      return rows.length > 0;
    },
    async listIdsForUser(userId) {
      return (await client.select({ id: userSessions.id }).from(userSessions).where(eq(userSessions.userId, userId))).map((row) => row.id);
    },
    async search(query) {
      // One extra row says whether another page exists, without a count.
      const rows = await client
        .select({
          id: userSessions.id,
          userId: userSessions.userId,
          userEmail: users.email,
          userName: users.name,
          userRole: users.role,
          ip: userSessions.ip,
          browser: userSessions.browser,
          os: userSessions.os,
          device: userSessions.device,
          mfaVerified: userSessions.mfaVerified,
          createdAt: userSessions.createdAt,
          lastSeenAt: userSessions.lastSeenAt,
          expiresAt: userSessions.expiresAt,
          revokedAt: userSessions.revokedAt,
          revokeReason: userSessions.revokeReason,
        })
        .from(userSessions)
        .innerJoin(users, eq(users.id, userSessions.userId))
        .where(sessionSearchWhere(query))
        .orderBy(desc(userSessions.lastSeenAt), desc(userSessions.id))
        .limit(query.limit + 1);
      const items = rows.slice(0, query.limit);
      const last = items[items.length - 1];
      return { items, next: rows.length > query.limit && last ? { lastSeenAt: last.lastSeenAt, id: last.id } : null };
    },
    async findManyWithOwner(ids) {
      if (ids.length === 0) return [];
      return client
        .select({
          id: userSessions.id,
          userId: userSessions.userId,
          revokedAt: userSessions.revokedAt,
          expiresAt: userSessions.expiresAt,
          user: { email: users.email, role: users.role },
        })
        .from(userSessions)
        .innerJoin(users, eq(users.id, userSessions.userId))
        .where(inArray(userSessions.id, ids));
    },
    async listLiveForUsers(userIds, now) {
      if (userIds.length === 0) return [];
      return client
        .select({ id: userSessions.id, userId: userSessions.userId })
        .from(userSessions)
        .where(and(inArray(userSessions.userId, userIds), live(now)));
    },
    async markMfaVerified(id) {
      await client.update(userSessions).set({ mfaVerified: true }).where(eq(userSessions.id, id));
    },
  };
}
