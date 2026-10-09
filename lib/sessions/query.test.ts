import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeCursor, encodeCursor, parseSessionView, sessionViewSearch } from "./query";

test("an empty URL shows active sessions", () => {
  const view = parseSessionView({});
  assert.deepEqual(view, { q: undefined, status: "active", user: undefined, after: undefined });
  assert.equal(sessionViewSearch(view), "");
});

test("the old ?ended=1 switch still opens every session", () => {
  assert.equal(parseSessionView({ ended: "1" }).status, "all");
  assert.equal(parseSessionView({ ended: "1", status: "ended" }).status, "ended");
});

test("a cursor round-trips to the millisecond and rejects junk", () => {
  const cursor = { lastSeenAt: new Date("2026-10-05T11:59:59.123Z"), id: "cmabc123" };
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
  assert.equal(decodeCursor("not-a-cursor"), undefined);
  assert.equal(decodeCursor("123.bad id;drop"), undefined);
  assert.equal(decodeCursor(undefined), undefined);
});

test("a user filter must look like a row id", () => {
  assert.equal(parseSessionView({ user: "cm1xyz" }).user, "cm1xyz");
  assert.equal(parseSessionView({ user: "x' OR 1=1" }).user, undefined);
});

test("a full view round-trips through the URL", () => {
  const view = parseSessionView({ q: "10.0.", status: "all", user: "cmuser1", after: "1759665599123.cmrow9" });
  assert.equal(sessionViewSearch(view), "?q=10.0.&status=all&user=cmuser1&after=1759665599123.cmrow9");
  assert.deepEqual(parseSessionView(Object.fromEntries(new URLSearchParams(sessionViewSearch(view)))), view);
});
