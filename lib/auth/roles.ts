import "server-only";

import { cache } from "react";

import { createRoleCatalog, type RoleCatalog, type RoleRecord } from "@sahan-sac/auth-kit/rbac/roles";

import { kv } from "@/lib/cache/redis";
import { repos } from "@/lib/data";
import { log } from "@/lib/log";

import { authKit, SUPER_ROLE, SYSTEM_ROLE_ROWS } from "./kit-config";

// Roles are rows in the `roles` table (auth-kit 0.7). One read per request
// (React cache) over a 60 second Redis copy, dropped whenever a role changes,
// the same way lib/auth/rbac.ts caches the permission matrix.

const KEY = `${authKit.keyPrefix}roles:v1`;
const TTL_SECONDS = 60;

async function readRoles(): Promise<readonly RoleRecord[]> {
  try {
    const cached = await kv.get<RoleRecord[]>(KEY);
    if (Array.isArray(cached) && cached.length > 0) return cached;
  } catch {
    // Redis down: read the database.
  }
  try {
    const rows = await repos.roles.list();
    if (rows.length === 0) return SYSTEM_ROLE_ROWS;
    await kv.set(KEY, rows, { ttlSeconds: TTL_SECONDS }).catch(() => undefined);
    return rows;
  } catch (error) {
    // Not cached, so the next request tries again. The built-in roles keep
    // every existing account working; custom roles hold nothing meanwhile.
    log.error("roles: could not read the roles table", { error: String(error) });
    return SYSTEM_ROLE_ROWS;
  }
}

/** Every role and the rank hierarchy, loaded once per request. */
export const getRoleCatalog = cache(async (): Promise<RoleCatalog> => createRoleCatalog(await readRoles(), SUPER_ROLE));

export async function invalidateRoles(): Promise<void> {
  await kv.del(KEY).catch(() => undefined);
}
