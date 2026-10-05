import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
