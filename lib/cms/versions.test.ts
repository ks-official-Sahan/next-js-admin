import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { draftConflict, findDraft, findPublished, issuePath, nextVersion, planSave, type BlockMeta } from "./versions";

const at = (iso: string) => new Date(iso);
const row = (version: number, status: BlockMeta["status"], updatedAt = "2026-01-01T00:00:00.000Z"): BlockMeta => ({
  version,
  status,
  updatedAt: at(updatedAt),
});

describe("nextVersion", () => {
  it("starts at 1 and follows the highest version", () => {
    assert.equal(nextVersion([]), 1);
    assert.equal(nextVersion([row(1, "SUPERSEDED"), row(3, "PUBLISHED"), row(2, "SUPERSEDED")]), 4);
  });
});

describe("findDraft and findPublished", () => {
  const rows = [row(1, "SUPERSEDED"), row(2, "PUBLISHED"), row(3, "DRAFT")];
  it("finds the one of each", () => {
    assert.equal(findDraft(rows)?.version, 3);
    assert.equal(findPublished(rows)?.version, 2);
  });
  it("returns null when absent", () => {
    assert.equal(findDraft([row(1, "PUBLISHED")]), null);
    assert.equal(findPublished([row(1, "DRAFT")]), null);
  });
});

describe("draftConflict", () => {
  const draft = row(2, "DRAFT", "2026-05-05T10:00:00.000Z");
  it("accepts the same timestamp", () => assert.equal(draftConflict(draft, "2026-05-05T10:00:00.000Z"), false));
  it("refuses an older timestamp", () => assert.equal(draftConflict(draft, "2026-05-05T09:00:00.000Z"), true));
  it("refuses a save that saw no draft when one exists", () => assert.equal(draftConflict(draft, null), true));
  it("refuses a save that saw a draft that is gone", () => {
    assert.equal(draftConflict(null, "2026-05-05T10:00:00.000Z"), true);
  });
  it("accepts no draft on both sides", () => assert.equal(draftConflict(null, null), false));
});

describe("planSave", () => {
  it("creates the first draft", () => assert.equal(planSave([row(1, "PUBLISHED")], null), "create-draft"));
  it("updates the draft in place", () => {
    const rows = [row(1, "PUBLISHED"), row(2, "DRAFT", "2026-02-02T00:00:00.000Z")];
    assert.equal(planSave(rows, "2026-02-02T00:00:00.000Z"), "update-draft");
  });
  it("reports a conflict for stale editors", () => {
    const rows = [row(2, "DRAFT", "2026-02-02T00:00:00.000Z")];
    assert.equal(planSave(rows, "2026-01-01T00:00:00.000Z"), "conflict");
    assert.equal(planSave(rows, null), "conflict");
  });
});

describe("issuePath", () => {
  it("writes dotted and indexed paths", () => {
    assert.equal(issuePath(["points", 2, "label"]), "points[2].label");
    assert.equal(issuePath(["cta", "href"]), "cta.href");
    assert.equal(issuePath([]), "");
  });
});
