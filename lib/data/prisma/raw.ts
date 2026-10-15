import { Prisma } from "@prisma/client";

import { DEFAULT_SCHEMA, runtimeSchema } from "@/lib/db/url";

// Prisma qualifies its own queries with the adapter's `schema` option, but raw
// SQL resolves table names through the database role's search_path. On the
// shared Neon database that path starts with another app's schema, so an
// unqualified `users` or `media_assets` reads (and locks) that app's rows.
// Every raw statement names its tables through `table()`.

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** A table in this app's schema, quoted for raw SQL. The schema comes from DATABASE_URL (allowed list only). */
export function table(name: string, env: Record<string, string | undefined> = process.env): Prisma.Sql {
  if (!IDENTIFIER.test(name)) throw new Error(`Not a table name: ${name}`);
  const schema = env.DATABASE_URL ? runtimeSchema(env) : DEFAULT_SCHEMA;
  return Prisma.raw(`"${schema}"."${name}"`);
}
