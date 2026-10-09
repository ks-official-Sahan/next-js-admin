import { and, desc, eq, gt, inArray, isNull, or, type SQL } from "drizzle-orm";

import type { RoleName } from "@/lib/auth/permissions";
import { authTokens } from "@/lib/db/schema";

import type { AuthTokenRepo } from "../auth-tokens";
import { first, one, type DbClient } from "./client";

const open = () => and(isNull(authTokens.usedAt), isNull(authTokens.revokedAt));

export function authTokenRepo(client: DbClient): AuthTokenRepo {
  const revokeWhere = async (where: SQL | undefined) =>
    (await client.update(authTokens).set({ revokedAt: new Date() }).where(where).returning({ id: authTokens.id })).length;
  return {
    async findByHash(tokenHash) {
      return first(await client.select().from(authTokens).where(eq(authTokens.tokenHash, tokenHash)).limit(1));
    },
    listOpenInvites(now) {
      return client
        .select()
        .from(authTokens)
        .where(and(eq(authTokens.purpose, "INVITE"), open(), gt(authTokens.expiresAt, now)))
        .orderBy(desc(authTokens.createdAt));
    },
    async findOpenInvite(id) {
      return first(await client.select().from(authTokens).where(and(eq(authTokens.id, id), eq(authTokens.purpose, "INVITE"), open())).limit(1));
    },
    async create(input) {
      return one(await client.insert(authTokens).values(input).returning(), "Token");
    },
    async revoke(id) {
      await revokeWhere(eq(authTokens.id, id));
    },
    revokeIfOpen(id) {
      return revokeWhere(and(eq(authTokens.id, id), open()));
    },
    async revokeOpenForUser(purpose, userId) {
      await revokeWhere(and(eq(authTokens.purpose, purpose), eq(authTokens.userId, userId), open()));
    },
    async revokeOpenInvitesTo(email, { roles, createdById }) {
      const byRole = roles.length > 0 ? inArray(authTokens.role, [...roles] as RoleName[]) : undefined;
      await revokeWhere(and(eq(authTokens.purpose, "INVITE"), eq(authTokens.email, email), open(), or(byRole, eq(authTokens.createdById, createdById))));
    },
    revokeOpenInvitesForRole(role) {
      return revokeWhere(and(eq(authTokens.purpose, "INVITE"), eq(authTokens.role, role as RoleName), open()));
    },
    async revokeOpenInvitesSentBy(userId) {
      await revokeWhere(and(eq(authTokens.purpose, "INVITE"), eq(authTokens.createdById, userId), open()));
    },
    async revokeOpenInvitesSentByAny(userIds) {
      if (userIds.length === 0) return;
      await revokeWhere(and(eq(authTokens.purpose, "INVITE"), inArray(authTokens.createdById, userIds), open()));
    },
    async rotateOpenInvite(id, tokenHash, expiresAt) {
      const rows = await client
        .update(authTokens)
        .set({ tokenHash, expiresAt })
        .where(and(eq(authTokens.id, id), eq(authTokens.purpose, "INVITE"), open()))
        .returning({ id: authTokens.id });
      return rows.length;
    },
    async claim(id, now) {
      const rows = await client
        .update(authTokens)
        .set({ usedAt: now })
        .where(and(eq(authTokens.id, id), open(), gt(authTokens.expiresAt, now)))
        .returning({ id: authTokens.id });
      return rows.length;
    },
    async deleteForUser(userId) {
      await client
        .delete(authTokens)
        .where(
          or(
            eq(authTokens.userId, userId),
            and(eq(authTokens.purpose, "INVITE"), eq(authTokens.createdById, userId), isNull(authTokens.usedAt))
          )
        );
    },
    async deleteForUsers(userIds) {
      if (userIds.length === 0) return;
      await client
        .delete(authTokens)
        .where(
          or(
            inArray(authTokens.userId, userIds),
            and(eq(authTokens.purpose, "INVITE"), inArray(authTokens.createdById, userIds), isNull(authTokens.usedAt))
          )
        );
    },
  };
}
