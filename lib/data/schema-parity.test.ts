import assert from "node:assert/strict";
import { test } from "node:test";

import type { PGlite } from "@electric-sql/pglite";

import { drizzleDdl, pgliteWith, prismaDdl } from "./test-support/pg";

// prisma/schema.prisma and lib/db/schema.ts must build the same database:
// same tables, columns, types, defaults, enums, indexes and constraints. Then
// either ORM works against a database the other created.

async function describeDb(pg: PGlite) {
  const rows = async (sql: string) => (await pg.query<Record<string, unknown>>(sql)).rows;
  return {
    columns: await rows(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, datetime_precision
      FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY table_name, column_name`),
    enums: await rows(`
      SELECT t.typname, e.enumlabel, e.enumsortorder
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      ORDER BY t.typname, e.enumsortorder`),
    indexes: await rows(`
      SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'
      ORDER BY tablename, indexname`),
    constraints: await rows(`
      SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public'
      ORDER BY 1, 2`),
  };
}

test("the Prisma and Drizzle schemas create identical databases", async () => {
  const [fromPrisma, fromDrizzle] = await Promise.all([pgliteWith(prismaDdl()), pgliteWith(await drizzleDdl())]);
  try {
    const [a, b] = await Promise.all([describeDb(fromPrisma), describeDb(fromDrizzle)]);
    assert.ok(a.columns.length > 150, "the Prisma schema created the tables");
    assert.deepEqual(b.enums, a.enums);
    assert.deepEqual(b.columns, a.columns);
    assert.deepEqual(b.indexes, a.indexes);
    assert.deepEqual(b.constraints, a.constraints);
  } finally {
    await Promise.all([fromPrisma.close(), fromDrizzle.close()]);
  }
});
