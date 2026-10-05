import { and, eq } from "drizzle-orm";

import { users, userSessions } from "@/lib/db/schema";

import type { UserSessionRepo } from "../user-sessions";
import { first, type DbClient } from "./client";

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
    async markMfaVerified(id) {
      await client.update(userSessions).set({ mfaVerified: true }).where(eq(userSessions.id, id));
    },
  };
}
