// CLI entry for the idempotent seeds. Run through the package script:
//   db:seed = node --env-file-if-exists=.env.local --conditions=react-server --import tsx prisma/seed.ts
// It prints a summary and never prints a secret.

import { db } from "../lib/db/prisma";
import { runSeed } from "../lib/db/seed";

async function main(): Promise<void> {
  const summary = await runSeed(db);
  console.log(JSON.stringify(summary));
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exit(1);
  });
