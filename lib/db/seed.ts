// Idempotent seeds: the owner account and the default role permissions.
// Running them twice is safe, and neither ever overwrites something the owner
// changed. Design notes: section 7.

import type { PrismaClient } from "@prisma/client";

import { hashPassword } from "../auth/password";
import {
  PERMISSION_ADDED_IN,
  RBAC_SEED_VERSION,
  defaultPermissionsFor,
  type Permission,
  type RoleName,
} from "../auth/permissions";

/** The slice of the Prisma client the seeds use, so tests can pass a fake. */
export type SeedDb = Pick<PrismaClient, "user" | "rolePermission" | "setting">;

type Env = Record<string, string | undefined>;

export type SeedOwnerResult = "created" | "exists" | "skipped-users-exist" | "missing-env";

/**
 * Creates the owner (role DEVELOPER, temporary password, forced change) from
 * ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_NAME.
 *
 * - An existing account with that email is never touched, so a changed
 *   password is never overwritten.
 * - `cli` mode creates the owner when the email is missing.
 * - `bootstrap` mode (first sign-in on a fresh database) creates the owner only
 *   when the users table is empty, so a deleted owner is never recreated.
 */
export async function seedOwner(
  db: SeedDb,
  env: Env = process.env,
  mode: "cli" | "bootstrap" = "cli"
): Promise<SeedOwnerResult> {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) return "missing-env";

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return "exists";

  if (mode === "bootstrap" && (await db.user.count()) > 0) return "skipped-users-exist";

  await db.user.create({
    data: {
      email,
      name: env.ADMIN_NAME?.trim() || null,
      passwordHash: await hashPassword(password),
      role: "DEVELOPER",
      mustChangePassword: true,
    },
  });
  return "created";
}

const SEED_VERSION_KEY = "rbac.seedVersion";

function readVersion(value: unknown): number {
  if (value && typeof value === "object" && "version" in value) {
    const version = (value as { version: unknown }).version;
    if (typeof version === "number" && Number.isInteger(version) && version > 0) return version;
  }
  return 0;
}

export interface SeedPermissionsOptions {
  /** Defaults per role. Overridable for tests. */
  defaults?: (role: RoleName) => Permission[];
  /** Seed version in which a permission first existed. */
  addedIn?: Partial<Record<Permission, number>>;
  /** Version of the code's permission set. */
  version?: number;
}

/**
 * Seeds the role permission matrix for MANAGER and EDITOR (DEVELOPER always
 * holds everything in code).
 *
 * - First seed (nothing stored yet): inserts each role's defaults.
 * - Later seeds: inserts only permissions added since the stored seed version,
 *   for the roles whose defaults include them. A permission the owner removed
 *   is never granted again, and a role the owner emptied stays empty.
 */
export async function seedRolePermissions(
  db: SeedDb,
  options: SeedPermissionsOptions = {}
): Promise<{ inserted: number; version: number }> {
  const defaults = options.defaults ?? defaultPermissionsFor;
  const addedIn = options.addedIn ?? PERMISSION_ADDED_IN;
  const version = options.version ?? RBAC_SEED_VERSION;

  const stored = await db.setting.findUnique({ where: { key: SEED_VERSION_KEY } });
  const storedVersion = readVersion(stored?.value);

  let inserted = 0;
  for (const role of ["MANAGER", "EDITOR"] as const) {
    const existingRows = await db.rolePermission.count({ where: { role } });
    const firstSeed = storedVersion === 0 && existingRows === 0;

    let wanted: Permission[] = [];
    if (firstSeed) {
      wanted = defaults(role);
    } else if (storedVersion < version) {
      wanted = defaults(role).filter((permission) => (addedIn[permission] ?? 1) > storedVersion);
    }
    if (wanted.length === 0) continue;

    const result = await db.rolePermission.createMany({
      data: wanted.map((permission) => ({ role, permission })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  if (storedVersion < version) {
    await db.setting.upsert({
      where: { key: SEED_VERSION_KEY },
      create: { key: SEED_VERSION_KEY, value: { version } },
      update: { value: { version } },
    });
  }
  return { inserted, version };
}

export interface SeedSummary {
  owner: SeedOwnerResult;
  permissions: { inserted: number; version: number };
}

/** Runs every seed. Safe to run any number of times. */
export async function runSeed(db: SeedDb, env: Env = process.env): Promise<SeedSummary> {
  const permissions = await seedRolePermissions(db);
  const owner = await seedOwner(db, env, "cli");
  return { owner, permissions };
}
