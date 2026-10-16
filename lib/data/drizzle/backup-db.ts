import "server-only";

import { getPool } from "@/lib/db/drizzle";

import type { BackupDb, Query } from "@/lib/backup/sql";

// BackupDb over the Drizzle client's Neon pool. The server-side cursors in
// lib/backup/export.ts need one connection for the whole transaction, so this
// checks a client out of the pool and runs BEGIN/COMMIT on it directly:
// Drizzle's query builder has no way to pass a raw statement with $n params.

export const backupDb: BackupDb = {
  async transaction(fn, { snapshot, timeoutMs }) {
    const client = await getPool().connect();
    let broken = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await client.query(snapshot ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
      const query: Query = async <Row,>(text: string, params: unknown[] = []) => (await client.query(text, params)).rows as Row[];
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Backup transaction exceeded ${timeoutMs} ms`)), timeoutMs);
      });
      const result = await Promise.race([fn(query), timeout]);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      // A timed-out statement may still be running: drop the connection
      // instead of returning it to the pool mid-transaction.
      broken = true;
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      client.release(broken);
    }
  },
};
