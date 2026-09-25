import { defineConfig } from "prisma/config";

import { deriveCliUrl } from "./lib/db/url";

// Prisma 7 does not read .env files itself. Load .env.local without
// overriding variables that are already set (CI, Vercel).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local. The environment already has what it needs, or the command
  // does not connect (for example `prisma generate`).
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Direct URL, no channel_binding, schema pinned to `public` (or `public_test`).
  datasource: { url: deriveCliUrl(process.env) },
});
