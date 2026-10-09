import type { RoleRepo } from "../roles";
import type { DbClient } from "./client";
import { translateUnique } from "./errors";

const columns = { name: true, label: true, description: true, rank: true, system: true } as const;

export function roleRepo(client: DbClient): RoleRepo {
  return {
    list() {
      return client.role.findMany({ select: columns, orderBy: [{ rank: "asc" }, { name: "asc" }] });
    },
    find(name) {
      return client.role.findUnique({ where: { name }, select: columns });
    },
    async create(input) {
      await translateUnique(() => client.role.create({ data: { ...input, system: false } }));
    },
    async update(name, patch) {
      await client.role.update({ where: { name }, data: patch });
    },
    async delete(name) {
      await client.role.delete({ where: { name, system: false } });
    },
    countUsers(name) {
      return client.user.count({ where: { role: name } });
    },
    async userCounts() {
      const groups = await client.user.groupBy({ by: ["role"], _count: { _all: true } });
      return Object.fromEntries(groups.map((group) => [group.role, group._count._all]));
    },
    async seedSystem(rows) {
      const { count } = await client.role.createMany({ data: rows.map((row) => ({ ...row })), skipDuplicates: true });
      return count;
    },
  };
}
