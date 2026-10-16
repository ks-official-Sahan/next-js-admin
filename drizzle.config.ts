import { defineConfig } from "drizzle-kit";

import { deriveCliUrl } from "./lib/db/url";

// drizzle-kit, for projects on the Drizzle data layer (lib/data/drizzle).
// Same rules as prisma.config.ts: load .env.local without overriding what is
// already set, and use the direct URL with the schema pinned.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local; the environment already has what it needs.
}

const cliUrl = deriveCliUrl(process.env);
const appSchema = (cliUrl && new URL(cliUrl).searchParams.get("schema")) || "public";

// node-postgres ignores Prisma's ?schema= parameter: pass the schema as the
// connection's search_path instead, so unqualified migration SQL (see
// scripts/drizzle-migration.ts) lands in the app's schema.
function withSearchPath(url: string | undefined): string {
  if (!url) return "";
  const parsed = new URL(url);
  parsed.searchParams.delete("schema");
  parsed.searchParams.set("options", `-c search_path="${appSchema}"`);
  return parsed.toString();
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: withSearchPath(cliUrl) },
  // Keep the applied-migrations table inside the app's own schema (the
  // default is a separate "drizzle" schema), like Prisma's _prisma_migrations.
  migrations: { table: "__drizzle_migrations", schema: appSchema },
});
