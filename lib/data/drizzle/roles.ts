import { and, asc, count, eq } from "drizzle-orm";

import { roles, users } from "@/lib/db/schema";

import type { RoleRepo } from "../roles";
import { countRows, first, type DbClient } from "./client";
import { translateUnique } from "./errors";

const columns = { name: roles.name, label: roles.label, description: roles.description, rank: roles.rank, system: roles.system };

export function roleRepo(client: DbClient): RoleRepo {
  return {
    list() {
      return client.select(columns).from(roles).orderBy(asc(roles.rank), asc(roles.name));
    },
    async find(name) {
      return first(await client.select(columns).from(roles).where(eq(roles.name, name)).limit(1));
    },
    async create(input) {
      await translateUnique(() => client.insert(roles).values({ ...input, system: false }));
    },
    async update(name, patch) {
      await client.update(roles).set(patch).where(eq(roles.name, name));
    },
    async delete(name) {
      await client.delete(roles).where(and(eq(roles.name, name), eq(roles.system, false)));
    },
    countUsers(name) {
      return countRows(client, users, eq(users.role, name));
    },
    async userCounts() {
      const groups = await client.select({ role: users.role, total: count() }).from(users).groupBy(users.role);
      return Object.fromEntries(groups.map((group) => [group.role, group.total]));
    },
    async seedSystem(rows) {
      const inserted = await client
        .insert(roles)
        .values(rows.map((row) => ({ ...row })))
        .onConflictDoNothing({ target: roles.name })
        .returning({ name: roles.name });
      return inserted.length;
    },
  };
}
