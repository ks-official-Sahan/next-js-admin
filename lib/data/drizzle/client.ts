import { count, type SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTable } from "drizzle-orm/pg-core";

/** Any Drizzle Postgres database or transaction (Neon in the app, PGlite in tests). */
export type DbClient = PgDatabase<PgQueryResultHKT, any, any>;

/** The first row, or null. */
export const first = <T>(rows: T[]): T | null => rows[0] ?? null;

/** The first row; throws like Prisma's update does when there is none. */
export function one<T>(rows: T[], what: string): T {
  if (!rows[0]) throw new Error(`${what} not found`);
  return rows[0];
}

export async function countRows(client: DbClient, table: PgTable, where?: SQL): Promise<number> {
  const [row] = await client.select({ n: count() }).from(table).where(where);
  return row?.n ?? 0;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
/** `%value%` for ILIKE, with LIKE wildcards in `value` matched literally. */
export const containsPattern = (value: string) => `%${escapeLike(value)}%`;
export const prefixPattern = (value: string) => `${escapeLike(value)}%`;

/** Rows a raw statement returned, whatever the driver's result shape. */
export const rawRows = (result: unknown): unknown[] => (result as { rows?: unknown[] }).rows ?? [];
