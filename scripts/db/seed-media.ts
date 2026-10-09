// CLI entry for the media import. Run through the package script:
//   db:seed-media = node --env-file-if-exists=.env.local --conditions=react-server --import tsx scripts/db/seed-media.ts
// Registers the images under public/works as LOCAL media assets. Idempotent:
// an asset already registered is left as it is (lib/media/seed.ts).

import { join } from "node:path";

import { repos } from "../../lib/data";
import { seedMediaAssets } from "../../lib/media/seed";

async function main(): Promise<void> {
  const summary = await seedMediaAssets(repos, join(process.cwd(), "public"));
  console.log(JSON.stringify(summary));
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Media import failed");
    process.exit(1);
  });
