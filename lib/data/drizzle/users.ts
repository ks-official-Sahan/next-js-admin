import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { users } from "@/lib/db/schema";

import type { UserRepo } from "../users";
import { countRows, first, one, type DbClient } from "./client";

const ref = { id: users.id, email: users.email, name: users.name, role: users.role, disabledAt: users.disabledAt };
const activeDevelopers = () => and(eq(users.role, "DEVELOPER"), isNull(users.disabledAt));

export function userRepo(client: DbClient): UserRepo {
  return {
    async findAccessState(id) {
      return first(await client.select({ id: users.id, role: users.role, disabledAt: users.disabledAt }).from(users).where(eq(users.id, id)).limit(1));
    },
    async findRef(id) {
      return first(await client.select(ref).from(users).where(eq(users.id, id)).limit(1));
    },
    async findRefByEmail(email) {
      return first(await client.select(ref).from(users).where(eq(users.email, email)).limit(1));
    },
    async findRefs(ids) {
      if (ids.length === 0) return [];
      return client.select(ref).from(users).where(inArray(users.id, ids));
    },
    async existsByEmail(email) {
      return (await client.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)).length > 0;
    },
    async findProfile(id) {
      return first(
        await client
          .select({ name: users.name, bio: users.bio, mfaEnabled: users.mfaEnabled, lastLoginAt: users.lastLoginAt })
          .from(users)
          .where(eq(users.id, id))
          .limit(1)
      );
    },
    async findPasswordHash(id) {
      return first(await client.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, id)).limit(1))?.passwordHash ?? null;
    },
    async findSecurityStatus(id) {
      return first(
        await client.select({ mfaEnabled: users.mfaEnabled, mustChangePassword: users.mustChangePassword }).from(users).where(eq(users.id, id)).limit(1)
      );
    },
    list() {
      return client
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          mfaEnabled: users.mfaEnabled,
          mustChangePassword: users.mustChangePassword,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
          disabledAt: users.disabledAt,
          // One correlated count per user, inside the same statement.
          activeSessions: sql<number>`(
            SELECT count(*)::int FROM user_sessions s
            WHERE s."userId" = ${users.id} AND s."revokedAt" IS NULL AND s."expiresAt" > now()
          )`,
        })
        .from(users)
        .orderBy(sql`${users.disabledAt} ASC NULLS FIRST`, asc(users.createdAt));
    },
    count() {
      return countRows(client, users);
    },
    countActiveDevelopers() {
      return countRows(client, users, activeDevelopers());
    },
    async lockActiveDevelopers() {
      await client.select({ id: users.id }).from(users).where(eq(users.role, "DEVELOPER")).for("update");
      return countRows(client, users, activeDevelopers());
    },
    async create(input) {
      return one(await client.insert(users).values(input).returning({ id: users.id }), "User");
    },
    async update(id, patch) {
      await client.update(users).set(patch).where(eq(users.id, id));
    },
    async delete(id) {
      await client.delete(users).where(eq(users.id, id));
    },
  };
}
