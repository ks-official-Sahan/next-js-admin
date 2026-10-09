import type { Prisma } from "@prisma/client";

import type { SettingRepo } from "../settings";
import type { DbClient } from "./client";

export function settingRepo(client: DbClient): SettingRepo {
  return {
    find(key) {
      return client.setting.findUnique({ where: { key }, select: { key: true, value: true } });
    },
    findMany(keys) {
      return client.setting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
    },
    async upsert(key, value, updatedById) {
      const json = value as Prisma.InputJsonValue;
      await client.setting.upsert({ where: { key }, create: { key, value: json, updatedById }, update: { value: json, updatedById } });
    },
  };
}
