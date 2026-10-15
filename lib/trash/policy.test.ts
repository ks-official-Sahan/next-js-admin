import assert from "node:assert/strict";
import { test } from "node:test";

import { daysLeft, isTrashEntity, reviveDates, trashCutoff, TRASH_DAYS } from "./policy";

test("reviveDates turns *At ISO strings back into Dates at any depth, and leaves other strings alone", () => {
  const out: any = reviveDates<unknown>({
    createdAt: "2026-10-10T10:00:00.000Z",
    title: "2026-10-10T10:00:00.000Z",
    revisions: [{ createdAt: "2026-10-09T10:00:00.000Z", data: { publishAt: null } }],
  });
  assert.ok(out.createdAt instanceof Date);
  assert.equal(out.title, "2026-10-10T10:00:00.000Z");
  assert.ok(out.revisions[0].createdAt instanceof Date);
  assert.equal(out.revisions[0].data.publishAt, null);
});

test("cutoff and days left follow TRASH_DAYS", () => {
  const now = Date.parse("2026-10-31T00:00:00.000Z");
  assert.equal(trashCutoff(now).toISOString(), new Date(now - TRASH_DAYS * 86_400_000).toISOString());
  assert.equal(daysLeft(new Date(now), now), TRASH_DAYS);
  assert.equal(daysLeft(new Date(now - 40 * 86_400_000), now), 0);
});

test("isTrashEntity knows the supported kinds only", () => {
  assert.equal(isTrashEntity("Post"), true);
  assert.equal(isTrashEntity("User"), false);
});
