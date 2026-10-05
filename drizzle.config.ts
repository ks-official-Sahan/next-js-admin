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

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: deriveCliUrl(process.env) ?? "" },
});
