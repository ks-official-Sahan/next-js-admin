import { eq, inArray } from "drizzle-orm";

import { settings } from "@/lib/db/schema";

import type { SettingRepo } from "../settings";
import { first, type DbClient } from "./client";

const columns = { key: settings.key, value: settings.value };

export function settingRepo(client: DbClient): SettingRepo {
  return {
    async find(key) {
      return first(await client.select(columns).from(settings).where(eq(settings.key, key)).limit(1));
    },
    async findMany(keys) {
      if (keys.length === 0) return [];
      return client.select(columns).from(settings).where(inArray(settings.key, keys));
    },
    async upsert(key, value, updatedById) {
      await client
        .insert(settings)
        .values({ key, value, updatedById })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedById, updatedAt: new Date() } });
    },
  };
}
