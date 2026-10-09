import { PGlite } from "@electric-sql/pglite";

// In-process Postgres (PGlite) for the schema-parity and repository contract
// tests. Nothing here connects to a real database server. The DDL comes from
// prisma-ddl.ts or drizzle-ddl.ts, one per ORM.

export async function pgliteWith(ddl: string): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(ddl);
  return pg;
}
