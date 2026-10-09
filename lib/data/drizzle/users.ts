import { and, asc, desc, eq, exists, gt, ilike, inArray, isNotNull, isNull, or, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { users, userSessions } from "@/lib/db/schema";

import type { PresentRoles, UserQuery, UserRepo, UserStatusFilter } from "../users";
import { containsPattern, countRows, first, one, type DbClient } from "./client";

const ref = { id: users.id, email: users.email, name: users.name, role: users.role, disabledAt: users.disabledAt };
const activeDevelopers = () => and(eq(users.role, "DEVELOPER"), isNull(users.disabledAt));

/** The users screen's columns, with live sessions counted in the same statement (no N+1). */
const listColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  masked: users.masked,
  mfaEnabled: users.mfaEnabled,
  mustChangePassword: users.mustChangePassword,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
  disabledAt: users.disabledAt,
  activeSessions: sql<number>`(
    SELECT count(*)::int FROM user_sessions s
    WHERE s."userId" = ${users.id} AND s."revokedAt" IS NULL AND s."expiresAt" > now()
  )`,
};

const STATUS_WHERE: Record<UserStatusFilter, () => SQL> = {
  active: () => isNull(users.disabledAt),
  disabled: () => isNotNull(users.disabledAt),
  "must-change": () => eq(users.mustChangePassword, true),
  "two-factor": () => eq(users.mfaEnabled, true),
  "no-two-factor": () => eq(users.mfaEnabled, false),
};

/** A super-role account this viewer sees under the mask role. */
const maskedAccount = (present: PresentRoles) =>
  present.global ? eq(users.role, present.superRole) : and(eq(users.role, present.superRole), eq(users.masked, true));

/**
 * The accounts a viewer who does not see through masks finds under `role`:
 * masked super-role accounts count as the mask role, never as their own.
 */
export function presentedRoleWhere(role: string, present: PresentRoles): SQL | undefined {
  if (role === present.maskAs) return or(eq(users.role, role), maskedAccount(present));
  if (role === present.superRole) return present.global ? sql`false` : and(eq(users.role, role), eq(users.masked, false));
  return eq(users.role, role);
}

/** Exported for tests: the filter the users screen sends to the database. */
export function userSearchWhere(query: Pick<UserQuery, "q" | "role" | "status" | "present">): SQL | undefined {
  const q = query.q?.trim();
  return and(
    q ? or(ilike(users.email, containsPattern(q)), ilike(users.name, containsPattern(q))) : undefined,
    query.role ? (query.present ? presentedRoleWhere(query.role, query.present) : eq(users.role, query.role)) : undefined,
    query.status ? STATUS_WHERE[query.status]() : undefined
  );
}

const by = (column: AnyColumn, dir: "asc" | "desc") => (dir === "asc" ? asc(column) : desc(column));
// dir is the "asc" | "desc" union, never user text, so sql.raw is safe here.
const nullsLast = (column: AnyColumn, dir: "asc" | "desc") => sql`${column} ${sql.raw(dir)} NULLS LAST`;

/**
 * Exported for tests. Every order ends on a unique key, so paging is stable
 * when the sort key ties. With `present`, the role sort is by the role shown.
 */
export function userSearchOrder({ sort, dir, present }: Pick<UserQuery, "sort" | "dir" | "present">): SQL[] {
  switch (sort) {
    case "name":
      return [nullsLast(users.name, dir), by(users.email, dir)];
    case "email":
      return [by(users.email, dir)];
    case "role":
      if (present) {
        // dir is the "asc" | "desc" union, never user text, so sql.raw is safe here.
        return [sql`CASE WHEN ${maskedAccount(present)} THEN ${present.maskAs} ELSE ${users.role} END ${sql.raw(dir)}`, asc(users.email)];
      }
      return [by(users.role, dir), asc(users.email)];
    case "last-login":
      return [nullsLast(users.lastLoginAt, dir), by(users.id, dir)];
    case "created":
      return [by(users.createdAt, dir), by(users.id, dir)];
    default:
      return [sql`${users.disabledAt} ASC NULLS FIRST`, asc(users.createdAt), asc(users.id)];
  }
}

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
          .select({ name: users.name, bio: users.bio, mfaEnabled: users.mfaEnabled, masked: users.masked, lastLoginAt: users.lastLoginAt })
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
      return client.select(listColumns).from(users).orderBy(sql`${users.disabledAt} ASC NULLS FIRST`, asc(users.createdAt));
    },
    async search(query) {
      const where = userSearchWhere(query);
      // The page and the total in parallel: two reads, one round trip of latency.
      const [items, total] = await Promise.all([
        client
          .select(listColumns)
          .from(users)
          .where(where)
          .orderBy(...userSearchOrder(query))
          .offset(query.offset)
          .limit(query.limit),
        countRows(client, users, where),
      ]);
      return { items, total };
    },
    listWithLiveSessions(now) {
      const live = client
        .select({ id: userSessions.id })
        .from(userSessions)
        .where(and(eq(userSessions.userId, users.id), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now)));
      return client.select(ref).from(users).where(exists(live)).orderBy(asc(users.email));
    },
    count() {
      return countRows(client, users);
    },
    countActiveDevelopers() {
      return countRows(client, users, activeDevelopers());
    },
    maskFlags(role) {
      return client.select({ id: users.id, masked: users.masked }).from(users).where(eq(users.role, role));
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
    async updateMany(ids, patch) {
      if (ids.length === 0) return;
      await client.update(users).set(patch).where(inArray(users.id, ids));
    },
    async deleteMany(ids) {
      if (ids.length === 0) return;
      await client.delete(users).where(inArray(users.id, ids));
    },
  };
}
