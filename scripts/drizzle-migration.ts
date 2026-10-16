// Writes a new Drizzle migration from lib/db/schema.ts (Drizzle data layer):
//
//   pnpm db:migration <name>
//
// drizzle-kit qualifies enums and foreign keys with "public", but this app
// runs in whatever schema DATABASE_URL names (lib/db/url.ts). The qualifier is
// stripped from the new files so they apply to that schema through the
// search_path drizzle.config.ts sets, and unique indexes are moved ahead of
// the foreign keys that reference them. Review the SQL, commit it, then apply
// it with `pnpm db:migrate`. Nothing here touches the database.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BREAK = "--> statement-breakpoint";

/** Removes the "public". qualifier drizzle-kit adds to type and table references. */
function unqualify(sql: string): string {
  return sql.replaceAll('"public".', "");
}

/**
 * drizzle-kit adds foreign keys before indexes, but a foreign key needs the
 * unique index on the column it references to exist already. Moves every
 * CREATE UNIQUE INDEX that follows the first foreign key to just before it.
 */
function uniqueIndexesFirst(sql: string): string {
  const statements = sql.split(BREAK).map((part) => part.trim()).filter(Boolean);
  const firstFk = statements.findIndex((part) => /\bFOREIGN KEY\b/.test(part));
  if (firstFk < 0) return sql;
  const unique = statements.filter((part, i) => i > firstFk && /^CREATE UNIQUE INDEX\b/.test(part));
  const rest = statements.filter((part) => !unique.includes(part));
  rest.splice(firstFk, 0, ...unique);
  return `${rest.join(`${BREAK}\n`)}\n`;
}

const name = process.argv[2] ?? "";
if (!/^[a-z0-9_]{1,60}$/.test(name)) {
  console.error("Usage: pnpm db:migration <name>   (lowercase letters, digits, underscores)");
  process.exit(1);
}

const dir = "drizzle";
const sqlFiles = () => new Set(existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".sql")) : []);
const before = sqlFiles();
const run = spawnSync("pnpm", ["exec", "drizzle-kit", "generate", "--name", name], { stdio: "inherit", shell: process.platform === "win32" });
if (run.status !== 0) process.exit(run.status ?? 1);

for (const file of sqlFiles()) {
  if (before.has(file)) continue;
  const target = path.join(dir, file);
  writeFileSync(target, uniqueIndexesFirst(unqualify(readFileSync(target, "utf8"))));
  console.log(`Wrote ${target}. Review it (look for DROP and data-losing ALTERs), commit it, then run pnpm db:migrate.`);
}
