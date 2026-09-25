// CLI entry for the blog import. Run through the package script:
//   db:seed-blog = node --env-file-if-exists=.env.local --conditions=react-server --import tsx prisma/seed-blog.ts
// Idempotent: only writes when the Post table is empty (lib/blog/seed.ts).
// Not run against the real database by this agent (design notes, Step 12).

import { seedBlog } from "../lib/blog/seed";
import { db } from "../lib/db/prisma";

async function main(): Promise<void> {
  const summary = await seedBlog(db);
  console.log(JSON.stringify(summary));
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Blog import failed");
    process.exit(1);
  });
