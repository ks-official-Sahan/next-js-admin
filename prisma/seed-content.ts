// CLI entry for the optional content import. Run through the package script:
//   db:seed-content = node --env-file-if-exists=.env.local --conditions=react-server --import tsx prisma/seed-content.ts
// It writes the code defaults of every section that has no row yet as version 1
// (published), prints a summary, and never prints a secret.

import { seedContent } from "../lib/cms/seed";
import { db } from "../lib/db/prisma";

async function main(): Promise<void> {
  const summary = await seedContent(db);
  console.log(JSON.stringify(summary));
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Content import failed");
    process.exit(1);
  });
