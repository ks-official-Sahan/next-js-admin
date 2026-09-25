import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AUDIT_MAX_PAGE_SIZE,
  AUDIT_PAGE_SIZE,
  auditQueryString,
  buildAuditWhere,
  decodeCursor,
  encodeCursor,
  parseAuditFilters,
} from "./audit-filters";

test("no parameters means no filter and the default page size", () => {
  const parsed = parseAuditFilters({});
  assert.deepEqual(parsed.filters, {});
  assert.equal(parsed.cursor, null);
  assert.equal(parsed.limit, AUDIT_PAGE_SIZE);
  assert.deepEqual(buildAuditWhere(parsed.filters), {});
});

test("valid filters are kept, trimmed, and dates cover whole days in UTC", () => {
  const { filters } = parseAuditFilters({
    actor: " owner@example.com ",
    action: "auth.*",
    entityType: "UserSession",
    entityId: "abc_123",
    from: "2026-01-02",
    to: "2026-01-03",
  });
  assert.equal(filters.actor, "owner@example.com");
  assert.equal(filters.action, "auth.*");
  assert.equal(filters.from?.toISOString(), "2026-01-02T00:00:00.000Z");
  assert.equal(filters.to?.toISOString(), "2026-01-03T23:59:59.999Z");
});

test("invalid values are dropped, never passed to the query", () => {
  const { filters } = parseAuditFilters({
    action: "auth login; drop",
    entityType: "a b",
    entityId: "x".repeat(101),
    actor: "a".repeat(255),
    from: "2026-13-45",
    to: "yesterday",
  });
  assert.deepEqual(filters, {});
});

test("the first value of a repeated parameter wins, arrays included", () => {
  assert.equal(parseAuditFilters({ action: ["user.created", "auth.*"] }).filters.action, "user.created");
});

test("a reversed date range is put right", () => {
  const { filters } = parseAuditFilters({ from: "2026-02-10", to: "2026-02-01" });
  assert.equal(filters.from?.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(filters.to?.toISOString(), "2026-02-10T23:59:59.999Z");
});

test("page size is clamped", () => {
  assert.equal(parseAuditFilters({ limit: "5" }).limit, 10);
  assert.equal(parseAuditFilters({ limit: "9999" }).limit, AUDIT_MAX_PAGE_SIZE);
  assert.equal(parseAuditFilters({ limit: "abc" }).limit, AUDIT_PAGE_SIZE);
  assert.equal(parseAuditFilters({ limit: "75" }).limit, 75);
});

test("the where clause: exact action, prefix action, actor by email or id, dates", () => {
  const exact = buildAuditWhere({ action: "user.created" });
  assert.deepEqual(exact, { AND: [{ action: "user.created" }] });

  const prefix = buildAuditWhere({ action: "auth.*" });
  assert.deepEqual(prefix, { AND: [{ action: { startsWith: "auth." } }] });

  const actor = buildAuditWhere({ actor: "owner" });
  assert.deepEqual(actor, {
    AND: [{ OR: [{ actorEmail: { contains: "owner", mode: "insensitive" } }, { actorId: "owner" }] }],
  });

  const from = new Date("2026-01-01T00:00:00Z");
  const to = new Date("2026-01-02T23:59:59.999Z");
  assert.deepEqual(buildAuditWhere({ from, to }), { AND: [{ createdAt: { gte: from, lte: to } }] });
  assert.deepEqual(buildAuditWhere({ from }), { AND: [{ createdAt: { gte: from } }] });
});

test("cursors round trip and bad ones are refused", () => {
  const cursor = { createdAt: new Date("2026-03-04T05:06:07.008Z"), id: "row-1" };
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
  for (const bad of [undefined, "", "not-base64!", Buffer.from("{}").toString("base64url"), Buffer.from('{"t":"x","i":1}').toString("base64url"), "a".repeat(300)]) {
    assert.equal(decodeCursor(bad), null, String(bad));
  }
});

test("the cursor continues strictly after the last row, ties broken by id", () => {
  const cursor = { createdAt: new Date("2026-03-04T05:06:07.008Z"), id: "row-1" };
  assert.deepEqual(buildAuditWhere({}, cursor), {
    AND: [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: "row-1" } }] }],
  });
});

test("the query string carries the filters and extras, and nothing when empty", () => {
  assert.equal(auditQueryString({}), "");
  const text = auditQueryString({ action: "auth.*", from: new Date("2026-01-02T00:00:00Z") }, { cursor: "abc" });
  const params = new URLSearchParams(text);
  assert.equal(params.get("action"), "auth.*");
  assert.equal(params.get("from"), "2026-01-02");
  assert.equal(params.get("cursor"), "abc");
});
