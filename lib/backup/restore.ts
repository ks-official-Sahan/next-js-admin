import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import type { EncryptionKey } from "./config";
import { type Manifest, unseal } from "./format";
import { type BackupDb, ident, parentsFirst, qualified, readSchema } from "./sql";

// Restore: verify everything first, then write everything in ONE transaction.
//
// loadBackup() downloads every table and checks its seal (AES-GCM: right
// key, right backup, right table), its SHA-256 and its row count before
// anything touches the database. restoreBackup() then inserts parents before
// children with json_populate_recordset(), resets sequences, and re-counts
// every table. Any failure rolls the whole restore back.

/** Approximate request size per INSERT. */
const CHUNK_BYTES = 2 * 1024 * 1024;

export type ReadObject = (objectName: string) => Promise<Buffer | null>;

/** Every table's NDJSON lines, verified. Throws on the first problem. */
export async function loadBackup(manifest: Manifest, read: ReadObject, keys: readonly EncryptionKey[]): Promise<Map<string, string[]>> {
  const key = keys.find((each) => each.id === manifest.keyId);
  if (!key) throw new Error(`Backup ${manifest.id} was sealed with key ${manifest.keyId}; set it as BACKUP_ENCRYPTION_KEY or in BACKUP_ENCRYPTION_KEY_PREVIOUS`);
  const tables = new Map<string, string[]>();
  for (const table of manifest.tables) {
    const sealed = await read(table.object);
    if (!sealed) throw new Error(`${table.name}: object ${table.object} is missing`);
    const gz = unseal(sealed, key, manifest.id, table.name);
    if (createHash("sha256").update(gz).digest("hex") !== table.sha256) throw new Error(`${table.name}: checksum does not match the manifest`);
    const lines = gunzipSync(gz).toString("utf8").split("\n").filter((line) => line.length > 0);
    if (lines.length !== table.rows) throw new Error(`${table.name}: ${lines.length} rows, the manifest says ${table.rows}`);
    tables.set(table.name, lines);
  }
  return tables;
}

export interface RestoreOptions {
  targetSchema: string;
  /** empty: refuse unless every target table is empty. replace: TRUNCATE them first (CASCADE). */
  mode: "empty" | "replace";
  /** Allow backup columns the target no longer has (their values are dropped). */
  allowColumnDrift?: boolean;
  timeoutMs?: number;
}

export interface RestoreResult {
  schema: string;
  tables: { name: string; rows: number }[];
  droppedColumns: string[];
  sequencesReset: number;
}

function chunks(lines: string[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (current.length > 0 && size + line.length > CHUNK_BYTES) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length > 0) out.push(current);
  return out;
}

export async function restoreBackup(db: BackupDb, manifest: Manifest, data: Map<string, string[]>, options: RestoreOptions): Promise<RestoreResult> {
  const schema = options.targetSchema;
  return db.transaction(
    async (query) => {
      const target = await readSchema(query, schema);
      const names = manifest.tables.map((table) => table.name);
      const missing = names.filter((name) => !target.tables.has(name));
      if (missing.length > 0) throw new Error(`Schema "${schema}" has no table ${missing.join(", ")}; create the schema first (pnpm db:migrate with DATABASE_URL set to ?schema=${schema})`);

      const droppedColumns: string[] = [];
      const plans = new Map<string, { columns: string[]; overriding: boolean }>();
      for (const table of manifest.tables) {
        const byName = new Map(target.tables.get(table.name)!.map((column) => [column.name, column]));
        for (const [column] of table.columns) if (!byName.has(column)) droppedColumns.push(`${table.name}.${column}`);
        const insertable = table.columns.map(([column]) => byName.get(column)).filter((column) => column !== undefined && !column.generated);
        plans.set(table.name, { columns: insertable.map((column) => column!.name), overriding: insertable.some((column) => column!.identityAlways) });
      }
      if (droppedColumns.length > 0 && !options.allowColumnDrift) {
        throw new Error(`The backup has columns the target lacks: ${droppedColumns.join(", ")}. Re-run with --allow-column-drift to drop them.`);
      }

      if (options.mode === "replace") {
        await query(`TRUNCATE TABLE ${names.map((name) => qualified(schema, name)).join(", ")} RESTART IDENTITY CASCADE`);
      } else {
        const filled: string[] = [];
        for (const name of names) {
          const [{ found }] = await query<{ found: boolean }>(`SELECT EXISTS (SELECT 1 FROM ${qualified(schema, name)}) AS found`);
          if (found) filled.push(name);
        }
        if (filled.length > 0) throw new Error(`Target tables are not empty: ${filled.join(", ")}. Use --replace to truncate them.`);
      }

      const selfReferencing = new Set(target.foreignKeys.filter(([child, parent]) => child === parent).map(([child]) => child));
      const { order, cyclic } = parentsFirst(names, target.foreignKeys);
      if (cyclic.length > 0) throw new Error(`Foreign keys form a cycle between ${cyclic.join(", ")}; this restore cannot order them`);

      for (const name of order) {
        const lines = data.get(name) ?? [];
        if (lines.length === 0) continue;
        const plan = plans.get(name)!;
        const list = plan.columns.map(ident).join(", ");
        const sql = `INSERT INTO ${qualified(schema, name)} (${list}) ${plan.overriding ? "OVERRIDING SYSTEM VALUE " : ""}SELECT ${list} FROM json_populate_recordset(NULL::${qualified(schema, name)}, $1::json)`;
        // A self-referencing table goes in one statement: its foreign key is
        // checked at the end of the statement, so row order does not matter.
        for (const part of selfReferencing.has(name) ? [lines] : chunks(lines)) {
          await query(sql, [`[${part.join(",")}]`]);
        }
      }

      let sequencesReset = 0;
      for (const name of order) {
        const sequences = await query<{ column_name: string; sequence: string | null }>(
          `SELECT a.attname::text AS column_name, pg_get_serial_sequence($1::text, a.attname) AS sequence
             FROM pg_attribute a
            WHERE a.attrelid = $1::text::regclass AND a.attnum > 0 AND NOT a.attisdropped`,
          [qualified(schema, name)]
        );
        for (const { column_name, sequence } of sequences) {
          if (!sequence) continue;
          await query(`SELECT setval($1::text, COALESCE((SELECT max(${ident(column_name)}) FROM ${qualified(schema, name)}), 0) + 1, false)`, [sequence]);
          sequencesReset += 1;
        }
      }

      const tables: { name: string; rows: number }[] = [];
      for (const table of manifest.tables) {
        const [{ count }] = await query<{ count: number }>(`SELECT count(*)::int AS count FROM ${qualified(schema, table.name)}`);
        if (count !== table.rows) throw new Error(`${table.name}: restored ${count} rows, expected ${table.rows}`);
        tables.push({ name: table.name, rows: count });
      }
      return { schema, tables, droppedColumns, sequencesReset };
    },
    { snapshot: false, timeoutMs: options.timeoutMs ?? 600_000 }
  );
}
