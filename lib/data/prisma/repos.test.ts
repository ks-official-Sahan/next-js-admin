import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { runRepoContract } from "../test-support/contract";
import { pgliteWith } from "../test-support/pg";
import { prismaDdl } from "../test-support/prisma-ddl";
import { createRepos } from "./index";

// Prisma talks to the in-process PGlite over a local socket (pglite-socket),
// through the node-postgres driver adapter. pglite-socket drops a connection
// after a failed statement (a unique violation), so the pool keeps a few and
// replaces the dropped one.
runRepoContract("Prisma", async () => {
  const pg = await pgliteWith(prismaDdl());
  const server = new PGLiteSocketServer({ db: pg, port: 0, maxConnections: 4 });
  await server.start();
  const connectionString = `postgresql://postgres:postgres@${server.getServerConn()}/postgres`;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 4 }) });
  return {
    repos: createRepos(prisma),
    withTx: (fn) => prisma.$transaction((tx) => fn(createRepos(tx))),
    async close() {
      await prisma.$disconnect();
      await server.stop();
      await pg.close();
    },
  };
});
