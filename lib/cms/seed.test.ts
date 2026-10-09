import assert from "node:assert/strict";
import { test } from "node:test";

import { UniqueViolation } from "@/lib/data/errors";

import { allSections } from "./registry";
import { seedContent, type ContentSeedDb } from "./seed";

interface Row {
  pageSlug: string;
  sectionSlug: string;
  version: number;
  status: string;
  note: string | null;
  data: unknown;
}

/** In-memory stand-in for the parts of the content repository the import uses. */
function fakeDb(rows: Row[] = [], failInsertWith?: Error) {
  const client = {
    contentBlocks: {
      async countSection(page: string, section: string) {
        return rows.filter((row) => row.pageSlug === page && row.sectionSlug === section).length;
      },
      async create(data: Row) {
        if (failInsertWith) throw failInsertWith;
        rows.push({ ...data, note: data.note ?? null });
        return { version: data.version, updatedAt: new Date() };
      },
    },
  };
  return { db: client as unknown as ContentSeedDb, rows };
}

test("imports every section once as version 1, published", async () => {
  const { db, rows } = fakeDb();
  const total = allSections().length;

  const first = await seedContent(db);
  assert.deepEqual(first, { created: total, skipped: 0 });
  assert.equal(rows.length, total);
  assert.ok(rows.every((row) => row.version === 1 && row.status === "PUBLISHED"));

  const second = await seedContent(db);
  assert.deepEqual(second, { created: 0, skipped: total });
  assert.equal(rows.length, total);
});

test("never touches a section that already has a row", async () => {
  const [first] = allSections();
  const { db, rows } = fakeDb([
    { pageSlug: first.page, sectionSlug: first.key, version: 3, status: "DRAFT", note: null, data: { edited: true } },
  ]);

  const summary = await seedContent(db);
  assert.equal(summary.skipped, 1);
  assert.deepEqual(rows[0].data, { edited: true });
  assert.equal(rows.filter((row) => row.sectionSlug === first.key && row.pageSlug === first.page).length, 1);
});

test("counts a lost race as skipped and rethrows other errors", async () => {
  const [first] = allSections();
  const race = await seedContent(fakeDb([], new UniqueViolation()).db, [first]);
  assert.deepEqual(race, { created: 0, skipped: 1 });

  await assert.rejects(() => seedContent(fakeDb([], new Error("connection lost")).db, [first]), /connection lost/);
});
