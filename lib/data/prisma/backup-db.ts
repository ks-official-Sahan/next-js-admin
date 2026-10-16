import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db/prisma";

import type { BackupDb, Query } from "@/lib/backup/sql";

// BackupDb over the app's Prisma client (Neon WebSocket driver): an
// interactive transaction holds one connection, which the server-side
// cursors in lib/backup/export.ts need. Statements that return no rows go through
// $executeRawUnsafe, the rest through $queryRawUnsafe.

const RETURNS_ROWS = /^\s*(SELECT|SHOW|FETCH|WITH|VALUES)\b/i;

export const backupDb: BackupDb = {
  transaction(fn, { snapshot, timeoutMs }) {
    return db.$transaction(
      async (tx) => {
        if (snapshot) await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const query: Query = async <Row,>(text: string, params: unknown[] = []) => {
          if (RETURNS_ROWS.test(text)) return tx.$queryRawUnsafe<Row[]>(text, ...params);
          await tx.$executeRawUnsafe(text, ...params);
          return [] as Row[];
        };
        return fn(query);
      },
      {
        isolationLevel: snapshot ? Prisma.TransactionIsolationLevel.RepeatableRead : Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: timeoutMs,
        // A suspended Neon compute takes a few seconds to wake.
        maxWait: 20_000,
      }
    );
  },
};
