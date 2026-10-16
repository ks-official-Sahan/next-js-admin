// The narrow database surface backups need: one transaction and raw queries
// inside it. Production passes the ORM adapter (lib/data/*/backup-db.ts); tests pass PGlite, a
// real in-process Postgres, so the SQL below is exercised for real.

export type Query = <Row = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<Row[]>;

export interface BackupDb {
  /**
   * Runs `fn` in one transaction. `snapshot`: REPEATABLE READ, READ ONLY, so
   * every table is read as of the same instant. Otherwise a normal read-write
   * transaction, all or nothing.
   */
  transaction<T>(fn: (query: Query) => Promise<T>, options: { snapshot: boolean; timeoutMs: number }): Promise<T>;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;

/** A double-quoted identifier. Refuses names outside a safe shape rather than escaping them. */
export function ident(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Refusing unusual identifier "${name}"`);
  return `"${name}"`;
}

export const qualified = (schema: string, table: string) => `${ident(schema)}.${ident(table)}`;

export interface ColumnInfo {
  name: string;
  type: string;
  /** GENERATED ... STORED: never inserted. */
  generated: boolean;
  /** GENERATED ALWAYS AS IDENTITY: needs OVERRIDING SYSTEM VALUE. */
  identityAlways: boolean;
}

export interface SchemaInfo {
  /** Table name to its columns, in table order. */
  tables: Map<string, ColumnInfo[]>;
  /** [child, parent] for each foreign key inside the schema. */
  foreignKeys: [string, string][];
}

/**
 * Tables, columns and in-schema foreign keys of `schema`, in two queries.
 * Catalog names are cast to text: Prisma's raw queries cannot decode the
 * `name` type (PGlite can, so only a real run shows it).
 */
export async function readSchema(query: Query, schema: string): Promise<SchemaInfo> {
  const columns = await query<{ table_name: string; column_name: string; type: string; generated: boolean; identity_always: boolean }>(
    `SELECT c.relname::text AS table_name, a.attname::text AS column_name, format_type(a.atttypid, a.atttypmod) AS type,
            a.attgenerated <> '' AS generated, a.attidentity = 'a' AS identity_always
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum`,
    [schema]
  );
  // One statement at a time: a transaction's connection runs queries in order anyway.
  const keys = await query<{ child: string; parent: string }>(
    `SELECT src.relname::text AS child, dst.relname::text AS parent
       FROM pg_constraint k
       JOIN pg_class src ON src.oid = k.conrelid
       JOIN pg_namespace sn ON sn.oid = src.relnamespace
       JOIN pg_class dst ON dst.oid = k.confrelid
       JOIN pg_namespace dn ON dn.oid = dst.relnamespace
      WHERE k.contype = 'f' AND sn.nspname = $1 AND dn.nspname = $1`,
    [schema]
  );
  const tables = new Map<string, ColumnInfo[]>();
  for (const row of columns) {
    const list = tables.get(row.table_name) ?? [];
    list.push({ name: row.column_name, type: row.type, generated: row.generated, identityAlways: row.identity_always });
    tables.set(row.table_name, list);
  }
  return { tables, foreignKeys: keys.map((key) => [key.child, key.parent]) };
}

/**
 * `tables` ordered so every parent comes before its children (Kahn's
 * algorithm; ties by name, so the order is stable). A self-reference is not
 * an ordering constraint. Tables caught in a cycle between each other come
 * last, by name; restoring them can fail, and the caller says so.
 */
export function parentsFirst(tables: readonly string[], foreignKeys: readonly [string, string][]): { order: string[]; cyclic: string[] } {
  const wanted = new Set(tables);
  const parents = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]));
  const children = new Map<string, string[]>(tables.map((table) => [table, []]));
  for (const [child, parent] of foreignKeys) {
    if (child === parent || !wanted.has(child) || !wanted.has(parent) || parents.get(child)!.has(parent)) continue;
    parents.get(child)!.add(parent);
    children.get(parent)!.push(child);
  }
  const waiting = new Map(tables.map((table) => [table, parents.get(table)!.size]));
  const ready = tables.filter((table) => waiting.get(table) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const next = ready.shift()!;
    order.push(next);
    for (const child of children.get(next)!) {
      const left = waiting.get(child)! - 1;
      waiting.set(child, left);
      if (left === 0) {
        ready.push(child);
        ready.sort();
      }
    }
  }
  const placed = new Set(order);
  const cyclic = tables.filter((table) => !placed.has(table)).sort();
  return { order: [...order, ...cyclic], cyclic };
}
