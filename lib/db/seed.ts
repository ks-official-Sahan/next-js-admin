// Idempotent seeds: the owner account and the default role permissions.
// Running them twice is safe, and neither ever overwrites something the owner
// changed. Design notes: section 7.

import type { Repos } from "../data/repos";

import { hashPassword } from "../auth/password";
import {
  PERMISSION_ADDED_IN,
  PERMISSION_SPLIT_FROM,
  RBAC_SEED_VERSION,
  SUPER_ROLE,
  SYSTEM_ROLE_ROWS,
  defaultPermissionsFor,
  type Permission,
  type RoleName,
} from "../auth/permissions";

/** The repositories the seeds use, so tests can pass a fake. */
export type SeedDb = Pick<Repos, "users" | "roles" | "rolePermissions" | "settings">;

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

  if (await db.users.existsByEmail(email)) return "exists";

  if (mode === "bootstrap" && (await db.users.count()) > 0) return "skipped-users-exist";

  // users.role is a foreign key: a fresh database needs the built-in roles first.
  await db.roles.seedSystem(SYSTEM_ROLE_ROWS);
  await db.users.create({
    email,
    name: env.ADMIN_NAME?.trim() || null,
    passwordHash: await hashPassword(password),
    role: SUPER_ROLE,
    mustChangePassword: true,
    createdById: null,
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
  /** Permissions split out of another: every holder of the source gets them on upgrade. */
  splitFrom?: Partial<Record<Permission, Permission>>;
}

/**
 * Seeds the role permission matrix for MANAGER and EDITOR (DEVELOPER and
 * SUPER_ADMIN hold their permissions in code).
 *
 * - First seed (nothing stored yet): inserts each role's defaults.
 * - Later seeds: inserts only permissions added since the stored seed version,
 *   for the roles whose defaults include them. A permission split out of
 *   another goes to every role holding the source instead. A permission the
 *   owner removed is never granted again, and a role the owner emptied stays
 *   empty.
 */
export async function seedRolePermissions(
  db: SeedDb,
  options: SeedPermissionsOptions = {}
): Promise<{ inserted: number; version: number }> {
  const defaults = options.defaults ?? defaultPermissionsFor;
  const addedIn = options.addedIn ?? PERMISSION_ADDED_IN;
  const version = options.version ?? RBAC_SEED_VERSION;
  const splitFrom = options.splitFrom ?? PERMISSION_SPLIT_FROM;

  const stored = await db.settings.find(SEED_VERSION_KEY);
  const storedVersion = readVersion(stored?.value);
  const isNew = (permission: Permission) => (addedIn[permission] ?? 1) > storedVersion;

  let inserted = 0;
  for (const role of ["MANAGER", "EDITOR"] as const) {
    const existingRows = await db.rolePermissions.countForRole(role);
    const firstSeed = storedVersion === 0 && existingRows === 0;

    let wanted: Permission[] = [];
    if (firstSeed) {
      wanted = defaults(role);
    } else if (storedVersion < version) {
      wanted = defaults(role).filter((permission) => isNew(permission) && !splitFrom[permission]);
    }
    if (wanted.length === 0) continue;

    inserted += await db.rolePermissions.grantMany(wanted.map((permission) => ({ role, permission })));
  }

  if (storedVersion > 0 && storedVersion < version) {
    for (const [permission, source] of Object.entries(splitFrom) as Array<[Permission, Permission]>) {
      if (!isNew(permission)) continue;
      const holders = await db.rolePermissions.rolesWith(source);
      inserted += await db.rolePermissions.grantMany(holders.map((role) => ({ role, permission })));
    }
  }

  if (storedVersion < version) {
    await db.settings.upsert(SEED_VERSION_KEY, { version }, null);
  }
  return { inserted, version };
}

export interface SeedSummary {
  /** Built-in roles that were missing and got inserted. */
  roles: number;
  owner: SeedOwnerResult;
  permissions: { inserted: number; version: number };
}

/** Runs every seed. Safe to run any number of times. */
export async function runSeed(db: SeedDb, env: Env = process.env): Promise<SeedSummary> {
  // Roles first: permissions and users point at them.
  const roles = await db.roles.seedSystem(SYSTEM_ROLE_ROWS);
  const permissions = await seedRolePermissions(db);
  const owner = await seedOwner(db, env, "cli");
  return { roles, owner, permissions };
}
