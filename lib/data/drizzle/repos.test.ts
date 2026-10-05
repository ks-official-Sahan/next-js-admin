import { drizzle } from "drizzle-orm/pglite";

import { runRepoContract } from "../test-support/contract";
import { pgliteWith, prismaDdl } from "../test-support/pg";
import { createRepos, transaction } from "./index";

// The database is built from prisma/schema.prisma, so this also proves the
// Drizzle repositories work on a database Prisma created.
runRepoContract("Drizzle", async () => {
  const pg = await pgliteWith(prismaDdl());
  const db = drizzle({ client: pg });
  return {
    repos: createRepos(db),
    withTx: (fn) => transaction(db, fn),
    close: () => pg.close(),
  };
});
