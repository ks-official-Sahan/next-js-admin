import "server-only";

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";
import { dbConfigured, isBuildPhase } from "./state";
import { runtimeConnectionString, runtimeSchema } from "./url";

export { dbConfigured, isBuildPhase };

// The Neon driver needs a WebSocket implementation on Node; the pooled
// WebSocket client supports interactive transactions (withTx).
neonConfig.webSocketConstructor = ws;

type Db = NeonDatabase<typeof schema>;
const globalForDb = globalThis as unknown as { appDrizzle?: Db };

function createClient(): Db {
  const connectionString = runtimeConnectionString(process.env);
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  // runtimeSchema() only returns a name from lib/db/url.ts's allowlist.
  const schemaName = runtimeSchema(process.env);
  if (schemaName !== "public") {
    pool.on("connect", (client: { query(text: string): Promise<unknown> }) => {
      void client.query(`SET search_path TO "${schemaName}"`);
    });
  }
  return drizzle({ client: pool, schema });
}

/** The shared client, created on first use. Throws when DATABASE_URL is unset. */
export function getDb(): Db {
  globalForDb.appDrizzle ??= createClient();
  return globalForDb.appDrizzle;
}

/**
 * Lazy handle to the client. Importing this module never connects and never
 * throws, so `next build` works on a machine with no database.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property) {
    const client = getDb();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
