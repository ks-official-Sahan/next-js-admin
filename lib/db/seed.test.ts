import assert from "node:assert/strict";
import { test } from "node:test";

import bcrypt from "bcryptjs";

import { PERMISSIONS, type Permission } from "../auth/permissions";
import { runSeed, seedOwner, seedRolePermissions, type SeedDb } from "./seed";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  role: string;
  mustChangePassword: boolean;
}

/** In-memory stand-in for the repositories the seeds use. */
function fakeDb() {
  const users: UserRow[] = [];
  const grants: Array<{ role: string; permission: string }> = [];
  const settings = new Map<string, unknown>();
  const roles: string[] = [];

  const client = {
    users: {
      async existsByEmail(email: string) {
        return users.some((user) => user.email === email);
      },
      async count() {
        return users.length;
      },
      async create(data: Omit<UserRow, "id">) {
        const row = { id: `user-${users.length + 1}`, ...data };
        users.push(row);
        return { id: row.id };
      },
    },
    roles: {
      async seedSystem(rows: Array<{ name: string }>) {
        const missing = rows.filter((row) => !roles.includes(row.name));
        roles.push(...missing.map((row) => row.name));
        return missing.length;
      },
    },
    rolePermissions: {
      async countForRole(role: string) {
        return grants.filter((grant) => grant.role === role).length;
      },
      async rolesWith(permission: string) {
        return grants.filter((grant) => grant.permission === permission).map((grant) => grant.role);
      },
      async grantMany(data: Array<{ role: string; permission: string }>) {
        let count = 0;
        for (const row of data) {
          if (grants.some((grant) => grant.role === row.role && grant.permission === row.permission)) continue;
          grants.push({ ...row });
          count += 1;
        }
        return count;
      },
    },
    settings: {
      async find(key: string) {
        return settings.has(key) ? { key, value: settings.get(key) } : null;
      },
      async upsert(key: string, value: unknown) {
        settings.set(key, value);
      },
    },
  };

  return { db: client as unknown as SeedDb, users, grants, settings };
}

const OWNER_ENV = {
  ADMIN_EMAIL: "Owner@Example.com",
  ADMIN_PASSWORD: "Temp-password-1!",
  ADMIN_NAME: "Owner",
};

test("seedOwner creates a DEVELOPER with a hashed temporary password", async () => {
  const { db, users } = fakeDb();
  assert.equal(await seedOwner(db, OWNER_ENV), "created");

  assert.equal(users.length, 1);
  const [owner] = users;
  assert.equal(owner.email, "owner@example.com", "email is stored lowercase");
  assert.equal(owner.role, "DEVELOPER");
  assert.equal(owner.mustChangePassword, true);
  assert.equal(owner.name, "Owner");
  assert.notEqual(owner.passwordHash, OWNER_ENV.ADMIN_PASSWORD);
  assert.equal(await bcrypt.compare(OWNER_ENV.ADMIN_PASSWORD, owner.passwordHash), true);
});

test("seedOwner is idempotent and never overwrites an existing password", async () => {
  const { db, users } = fakeDb();
  await seedOwner(db, OWNER_ENV);
  const before = users[0].passwordHash;
  users[0].mustChangePassword = false; // the owner already changed it

  assert.equal(await seedOwner(db, OWNER_ENV), "exists");
  assert.equal(await seedOwner(db, { ...OWNER_ENV, ADMIN_PASSWORD: "A-different-one-9!" }), "exists");

  assert.equal(users.length, 1);
  assert.equal(users[0].passwordHash, before);
  assert.equal(users[0].mustChangePassword, false);
});

test("seedOwner does nothing without ADMIN_EMAIL and ADMIN_PASSWORD", async () => {
  const { db, users } = fakeDb();
  assert.equal(await seedOwner(db, {}), "missing-env");
  assert.equal(await seedOwner(db, { ADMIN_EMAIL: "a@b.com" }), "missing-env");
  assert.equal(await seedOwner(db, { ADMIN_PASSWORD: "x" }), "missing-env");
  assert.equal(users.length, 0);
});

test("bootstrap mode creates the owner only on an empty users table", async () => {
  const empty = fakeDb();
  assert.equal(await seedOwner(empty.db, OWNER_ENV, "bootstrap"), "created");

  const busy = fakeDb();
  busy.users.push({
    id: "other",
    email: "someone@example.com",
    name: null,
    passwordHash: "x",
    role: "EDITOR",
    mustChangePassword: false,
  });
  assert.equal(await seedOwner(busy.db, OWNER_ENV, "bootstrap"), "skipped-users-exist");
  assert.equal(busy.users.length, 1, "a deleted owner is not recreated implicitly");

  assert.equal(await seedOwner(busy.db, OWNER_ENV, "cli"), "created", "the CLI may recreate it");
});

test("seedRolePermissions seeds defaults once and records the version", async () => {
  const { db, grants, settings } = fakeDb();

  const first = await seedRolePermissions(db);
  assert.equal(first.inserted, 29 + 8);
  assert.equal(grants.filter((grant) => grant.role === "MANAGER").length, 29);
  assert.equal(grants.filter((grant) => grant.role === "EDITOR").length, 8);
  assert.equal(grants.some((grant) => grant.role === "DEVELOPER" || grant.role === "SUPER_ADMIN"), false, "fixed roles store no rows");
  assert.deepEqual(settings.get("rbac.seedVersion"), { version: 2 });

  const second = await seedRolePermissions(db);
  assert.equal(second.inserted, 0);
  assert.equal(grants.length, 37);
});

test("a permission the owner removed is never granted again", async () => {
  const { db, grants } = fakeDb();
  await seedRolePermissions(db);

  const index = grants.findIndex((grant) => grant.role === "MANAGER" && grant.permission === "publishBlog");
  grants.splice(index, 1);
  for (let i = grants.length - 1; i >= 0; i -= 1) {
    if (grants[i].role === "EDITOR") grants.splice(i, 1); // the owner emptied EDITOR
  }

  const again = await seedRolePermissions(db);
  assert.equal(again.inserted, 0);
  assert.equal(grants.some((grant) => grant.permission === "publishBlog" && grant.role === "MANAGER"), false);
  assert.equal(grants.filter((grant) => grant.role === "EDITOR").length, 0);
});

test("a newer seed version adds only the new permissions", async () => {
  const { db, grants, settings } = fakeDb();
  await seedRolePermissions(db); // the current version, everything seeded

  // Version 3 introduces one permission that both MANAGER and EDITOR default to,
  // and the owner had removed it from MANAGER before the release.
  const added: Permission = "viewBlog";
  const index = grants.findIndex((grant) => grant.role === "EDITOR" && grant.permission === added);
  grants.splice(index, 1);

  const result = await seedRolePermissions(db, {
    version: 3,
    addedIn: { [added]: 3 },
  });

  assert.equal(result.inserted, 1, "only EDITOR lacked it, MANAGER already had the row");
  assert.equal(grants.filter((grant) => grant.permission === added && grant.role === "EDITOR").length, 1);
  assert.deepEqual(settings.get("rbac.seedVersion"), { version: 3 });

  const rerun = await seedRolePermissions(db, { version: 3, addedIn: { [added]: 3 } });
  assert.equal(rerun.inserted, 0);
});

test("a permission split out of another goes to every role that held the source", async () => {
  const { db, grants, settings } = fakeDb();
  // A version 1 database: MANAGER and a custom role hold manageChatbot, EDITOR does not.
  settings.set("rbac.seedVersion", { version: 1 });
  grants.push(
    { role: "MANAGER", permission: "manageChatbot" },
    { role: "SUPPORT", permission: "manageChatbot" },
    { role: "EDITOR", permission: "viewBlog" }
  );

  const result = await seedRolePermissions(db);
  const holders = grants.filter((grant) => grant.permission === "manageChatbotTraining").map((grant) => grant.role).sort();
  assert.deepEqual(holders, ["MANAGER", "SUPPORT"]);
  assert.equal(result.inserted, 2, "only the split, never the other MANAGER defaults again");
  assert.equal((await seedRolePermissions(db)).inserted, 0);
});

test("seeded permissions are always real catalogue keys", async () => {
  const { db, grants } = fakeDb();
  await seedRolePermissions(db);
  const known = new Set<string>(PERMISSIONS);
  for (const grant of grants) assert.ok(known.has(grant.permission), grant.permission);
});

test("runSeed runs both seeds and is safe to repeat", async () => {
  const { db, users, grants } = fakeDb();
  const first = await runSeed(db, OWNER_ENV);
  assert.equal(first.owner, "created");
  assert.equal(first.permissions.inserted, 37);

  const second = await runSeed(db, OWNER_ENV);
  assert.equal(second.owner, "exists");
  assert.equal(second.permissions.inserted, 0);
  assert.equal(users.length, 1);
  assert.equal(grants.length, 37);
});
