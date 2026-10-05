import assert from "node:assert/strict";
import { test } from "node:test";

import { sessionSearchWhere, userSessionRepo } from "@/lib/data/prisma/user-sessions";

import { decodeCursor, encodeCursor, parseSessionView, sessionViewSearch } from "./query";

const NOW = new Date("2026-10-05T12:00:00.000Z");

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

test("the where clause combines the owner, liveness, search and keyset", () => {
  const after = { lastSeenAt: new Date("2026-10-05T10:00:00.000Z"), id: "cmrow5" };
  assert.deepEqual(sessionSearchWhere({ q: "ada", userId: "cmuser1", status: "active", after, now: NOW }), {
    AND: [
      { userId: "cmuser1" },
      { revokedAt: null, expiresAt: { gt: NOW } },
      {
        OR: [
          { user: { email: { contains: "ada", mode: "insensitive" } } },
          { user: { name: { contains: "ada", mode: "insensitive" } } },
          { ip: { contains: "ada" } },
        ],
      },
      { OR: [{ lastSeenAt: { lt: after.lastSeenAt } }, { lastSeenAt: after.lastSeenAt, id: { lt: "cmrow5" } }] },
    ],
  });
  assert.deepEqual(sessionSearchWhere({ status: "all", now: NOW }), {});
  assert.deepEqual(sessionSearchWhere({ status: "ended", now: NOW }), {
    AND: [{ OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: NOW } }] }],
  });
});

test("search reads one extra row to know about the next page, and never returns it", async () => {
  const rows = Array.from({ length: 3 }, (_, index) => ({
    id: `cm${index}`,
    userId: "u1",
    ip: null,
    browser: null,
    os: null,
    device: null,
    mfaVerified: false,
    createdAt: NOW,
    lastSeenAt: new Date(NOW.getTime() - index * 1000),
    expiresAt: NOW,
    revokedAt: null,
    revokeReason: null,
    user: { email: "a@example.com", name: null, role: "EDITOR" },
  }));
  let take = 0;
  const client = {
    userSession: {
      findMany: async (args: { take: number }) => {
        take = args.take;
        return rows.slice(0, args.take);
      },
    },
  };
  const page = await userSessionRepo(client as never).search({ status: "all", limit: 2, now: NOW });
  assert.equal(take, 3);
  assert.deepEqual(
    page.items.map((row) => row.id),
    ["cm0", "cm1"]
  );
  assert.deepEqual(page.next, { lastSeenAt: rows[1].lastSeenAt, id: "cm1" });

  const last = await userSessionRepo(client as never).search({ status: "all", limit: 5, now: NOW });
  assert.equal(last.next, null);
});
