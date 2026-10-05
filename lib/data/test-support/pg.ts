import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

import * as schema from "../../db/schema";

// In-process Postgres (PGlite) for the schema-parity and repository contract
// tests. Nothing here connects to a real database server.

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PRISMA_CLI = fileURLToPath(new URL("../../../node_modules/prisma/build/index.js", import.meta.url));

/** SQL that creates prisma/schema.prisma in an empty database (offline, no connection). */
export function prismaDdl(): string {
  return execFileSync(process.execPath, [PRISMA_CLI, "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** SQL that creates lib/db/schema.ts in an empty database. */
export async function drizzleDdl(): Promise<string> {
  const { generateDrizzleJson, generateMigration } = await import("drizzle-kit/api");
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  // Foreign keys last: chat_messages references chat_sessions."sessionId",
  // whose unique index drizzle-kit would otherwise create after the key.
  const foreignKey = (statement: string) => statement.includes("FOREIGN KEY");
  return [...statements.filter((s) => !foreignKey(s)), ...statements.filter(foreignKey)].join(";\n");
}

export async function pgliteWith(ddl: string): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(ddl);
  return pg;
}
