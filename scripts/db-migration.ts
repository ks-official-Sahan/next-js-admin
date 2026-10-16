// Writes a new Prisma migration from prisma/schema.prisma:
//
//   pnpm db:migration <name>
//
// The SQL is the difference between the database DATABASE_URL points at and
// the schema file, so that database must already have every committed
// migration applied (this checks with `prisma migrate status` first). Review
// the generated SQL, commit it, then apply it with `pnpm db:migrate`.
//
// It never writes to the database. `prisma migrate dev` is not used: on drift
// it offers to reset the schema, which on a shared database is never right.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const name = process.argv[2] ?? "";
if (!/^[a-z0-9_]{1,60}$/.test(name)) {
  console.error("Usage: pnpm db:migration <name>   (lowercase letters, digits, underscores)");
  process.exit(1);
}

const prisma = (args: string[]) => spawnSync("pnpm", ["exec", "prisma", ...args], { encoding: "utf8", shell: process.platform === "win32" });

const status = prisma(["migrate", "status"]);
if (status.status !== 0) {
  console.error(status.stdout + status.stderr);
  console.error("Apply the committed migrations first (pnpm db:migrate), then run this again.");
  process.exit(1);
}

const diff = prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script", "--exit-code"]);
if (diff.status === 0) {
  console.log("No schema changes: the database already matches prisma/schema.prisma.");
  process.exit(0);
}
if (diff.status !== 2) {
  console.error(diff.stdout + diff.stderr);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const dir = path.join("prisma", "migrations", `${stamp}_${name}`);
if (existsSync(dir)) throw new Error(`${dir} already exists`);
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "migration.sql"), diff.stdout);
console.log(`Wrote ${dir}/migration.sql. Review it (look for DROP and data-losing ALTERs), commit it, then run pnpm db:migrate.`);
execFileSync("git", ["add", "--intent-to-add", dir], { stdio: "ignore" });
