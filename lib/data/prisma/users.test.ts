import assert from "node:assert/strict";
import { test } from "node:test";

import { presentedRoleWhere, userSearchOrder, userSearchWhere } from "./users";

// Prisma-only: the Drizzle variant removes this folder, so ORM-neutral user
// view tests live in lib/users/query.test.ts.

test("search matches email or name case-insensitively, and filters stack", () => {
  assert.deepEqual(userSearchWhere({ q: "Ada", role: "EDITOR", status: "two-factor" }), {
    OR: [{ email: { contains: "Ada", mode: "insensitive" } }, { name: { contains: "Ada", mode: "insensitive" } }],
    role: "EDITOR",
    mfaEnabled: true,
  });
  assert.deepEqual(userSearchWhere({ status: "disabled" }), { disabledAt: { not: null } });
  assert.deepEqual(userSearchWhere({ q: "   " }), {});
});

test("a viewer who does not see through masks finds masked developers under SUPER_ADMIN only", () => {
  const one = { superRole: "DEVELOPER", maskAs: "SUPER_ADMIN", global: false, roles: ["DEVELOPER", "SUPER_ADMIN", "EDITOR"] };
  assert.deepEqual(presentedRoleWhere("SUPER_ADMIN", one), { OR: [{ role: "SUPER_ADMIN" }, { role: "DEVELOPER", masked: true }] });
  assert.deepEqual(presentedRoleWhere("DEVELOPER", one), { role: "DEVELOPER", masked: false });
  assert.deepEqual(presentedRoleWhere("EDITOR", one), { role: "EDITOR" });

  const all = { ...one, global: true };
  assert.deepEqual(presentedRoleWhere("SUPER_ADMIN", all), { OR: [{ role: "SUPER_ADMIN" }, { role: "DEVELOPER" }] });
  assert.deepEqual(presentedRoleWhere("DEVELOPER", all), { id: { in: [] } }, "nobody shows as a developer");
  assert.deepEqual(userSearchWhere({ q: "ada", role: "SUPER_ADMIN", present: all }), {
    OR: [{ email: { contains: "ada", mode: "insensitive" } }, { name: { contains: "ada", mode: "insensitive" } }],
    AND: [{ OR: [{ role: "SUPER_ADMIN" }, { role: "DEVELOPER" }] }],
  });
});

test("every order ends on a unique key, so pages never overlap", () => {
  for (const sort of ["default", "name", "email", "role", "last-login", "created"] as const) {
    const order = userSearchOrder({ sort, dir: "desc" });
    const last = order[order.length - 1];
    assert.ok("id" in last || "email" in last, `${sort} ends on ${JSON.stringify(last)}`);
  }
  assert.deepEqual(userSearchOrder({ sort: "last-login", dir: "desc" }), [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { id: "desc" }]);
});
