import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_GRANTS, PERMISSIONS, type Permission } from "../auth/permissions";
import { isActive } from "./active";
import { ADMIN_NAV, ADMIN_NAV_GROUPS, navFor } from "./nav";

const linksFor = (granted: readonly Permission[]) =>
  navFor(granted).flatMap((section) => section.items.map((item) => item.href));

test("nav links are unique, sit under /admin and use a known group", () => {
  const groupIds = new Set<string>(ADMIN_NAV_GROUPS.map((group) => group.id));
  const hrefs = ADMIN_NAV.map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const item of ADMIN_NAV) {
    assert.ok(item.href === "/admin" || item.href.startsWith("/admin/"), item.href);
    assert.ok(groupIds.has(item.group), `${item.href} has unknown group ${item.group}`);
  }
});

test("every link asks for a catalogue permission or for none", () => {
  const known = new Set<string>(PERMISSIONS);
  for (const item of ADMIN_NAV) {
    assert.ok(item.permission === null || known.has(item.permission), item.href);
  }
});

test("a user with every permission sees every link, in declared order", () => {
  assert.deepEqual(
    linksFor(PERMISSIONS),
    ADMIN_NAV.map((item) => item.href)
  );
});

test("EDITOR defaults see the content links and the account page only", () => {
  assert.deepEqual(linksFor(DEFAULT_GRANTS.EDITOR), [
    "/admin",
    "/admin/content",
    "/admin/works",
    "/admin/blog",
    "/admin/media",
    "/admin/account",
  ]);
});

test("MANAGER defaults see everything except roles and settings", () => {
  const links = linksFor(DEFAULT_GRANTS.MANAGER);
  assert.ok(!links.includes("/admin/roles"));
  assert.ok(!links.includes("/admin/settings"));
  assert.ok(links.includes("/admin/users"));
  assert.ok(links.includes("/admin/audit"));
});

test("with no permissions only the account link remains and empty sections are dropped", () => {
  const sections = navFor([]);
  assert.deepEqual(
    sections.map((section) => section.id),
    ["account"]
  );
  assert.deepEqual(
    sections[0].items.map((item) => item.href),
    ["/admin/account"]
  );
});

test("isActive: the dashboard matches only itself, sections match nested paths", () => {
  assert.equal(isActive("/admin", "/admin"), true);
  assert.equal(isActive("/admin/users", "/admin"), false);
  assert.equal(isActive("/admin/users", "/admin/users"), true);
  assert.equal(isActive("/admin/users/42", "/admin/users"), true);
  assert.equal(isActive("/admin/users-archive", "/admin/users"), false);
});
