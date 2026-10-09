import assert from "node:assert/strict";
import { test } from "node:test";

import { presentedRoleWhere, userSearchOrder, userSearchWhere } from "@/lib/data/prisma/users";

import { isFiltered, parseUserView, userQueryOf, userViewSearch } from "./query";

test("an empty URL is the default view on page 1", () => {
  const view = parseUserView({});
  assert.deepEqual(view, { q: undefined, role: undefined, status: undefined, sort: "default", dir: "asc", page: 1 });
  assert.equal(userViewSearch(view), "");
  assert.equal(isFiltered(view), false);
});

test("a full URL round-trips, with a leading minus for descending", () => {
  const view = parseUserView({ q: " ada ", role: "MANAGER", status: "disabled", sort: "-last-login", page: "3" });
  assert.deepEqual(view, { q: "ada", role: "MANAGER", status: "disabled", sort: "last-login", dir: "desc", page: 3 });
  assert.equal(userViewSearch(view), "?q=ada&role=MANAGER&status=disabled&sort=-last-login&page=3");
  assert.deepEqual(parseUserView(Object.fromEntries(new URLSearchParams(userViewSearch(view)))), view);
});

test("unknown or hostile values fall back to the default instead of failing", () => {
  const view = parseUserView({ role: "owner; drop", status: "deleted", sort: "-password", page: "-4", q: "x".repeat(500) });
  assert.equal(view.role, undefined);
  assert.equal(view.status, undefined);
  assert.equal(view.sort, "default");
  assert.equal(view.dir, "asc");
  assert.equal(view.page, 1);
  assert.equal(view.q?.length, 100);
  assert.equal(parseUserView({ page: "999999999" }).page, 10_000);
});

test("a filter change resets paging through the patch", () => {
  const view = parseUserView({ page: "4", role: "EDITOR" });
  assert.equal(userViewSearch(view, { status: "active", page: 1 }), "?role=EDITOR&status=active");
});

test("the query pages by offset", () => {
  assert.deepEqual(userQueryOf(parseUserView({ page: "3" }), 25), {
    q: undefined,
    role: undefined,
    status: undefined,
    sort: "default",
    dir: "asc",
    offset: 50,
    limit: 25,
  });
});

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
