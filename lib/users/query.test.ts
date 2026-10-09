import assert from "node:assert/strict";
import { test } from "node:test";

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
