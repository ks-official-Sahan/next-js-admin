import { drizzle } from "drizzle-orm/pglite";

import { runRepoContract } from "../test-support/contract";
import { drizzleDdl } from "../test-support/drizzle-ddl";
import { pgliteWith } from "../test-support/pg";
import { createRepos, transaction } from "./index";

// The database is built from lib/db/schema.ts; schema-parity.test.ts checks
// Prisma builds the same one, so these repositories also run on it.
runRepoContract("Drizzle", async () => {
  const pg = await pgliteWith(await drizzleDdl());
  const db = drizzle({ client: pg });
  return {
    repos: createRepos(db),
    withTx: (fn) => transaction(db, fn),
    close: () => pg.close(),
  };
});
