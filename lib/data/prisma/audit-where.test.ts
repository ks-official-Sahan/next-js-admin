import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAuditWhere } from "./audit-where";

test("no filter means an empty where clause", () => {
  assert.deepEqual(buildAuditWhere({}), {});
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

test("the cursor continues after the last row on ties of createdAt", () => {
  const createdAt = new Date("2026-03-04T05:06:07.008Z");
  assert.deepEqual(buildAuditWhere({}, { createdAt, id: "row-9" }), {
    AND: [{ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: "row-9" } }] }],
  });
});
