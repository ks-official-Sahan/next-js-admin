import assert from "node:assert/strict";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { backupConfigFromEnv, type BackupConfig, parseEncryptionKey } from "./config";
import { exportBackup } from "./export";
import { backupIdDate, expiredBackups, isoWeek, newBackupId, parseManifest, seal, unseal } from "./format";
import { loadBackup, restoreBackup } from "./restore";
import { type BackupDb, ident, parentsFirst, type Query } from "./sql";

const KEY = parseEncryptionKey("a".repeat(64))!;
const OTHER_KEY = parseEncryptionKey("b".repeat(64))!;

function pgliteDb(pg: PGlite): BackupDb {
  return {
    transaction: (fn, { snapshot }) =>
      pg.transaction(async (tx) => {
        if (snapshot) await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const query: Query = async <Row,>(text: string, params: unknown[] = []) => (await tx.query<Row>(text, params)).rows;
        return fn(query);
      }),
  };
}

function configFor(schema: string): BackupConfig {
  return {
    account: { id: "backup", provider: "s3", slot: 0, capBytes: null, readOnly: false, endpoint: "https://s3.test", region: "us-east-1", bucket: "b", accessKeyId: "k", secretAccessKey: "s", publicUrl: "https://s3.test/b" },
    prefix: "db",
    schema,
    excludeTables: ["user_sessions"],
    key: KEY,
    previousKeys: [],
    retention: { daily: 3, weekly: 2, monthly: 2 },
  };
}

const DDL = (schema: string) => `
  CREATE SCHEMA ${schema};
  CREATE TABLE ${schema}.users (id text PRIMARY KEY, email text NOT NULL UNIQUE, created_at timestamp(3) NOT NULL DEFAULT now(),
    tags text[] NOT NULL DEFAULT '{}', meta jsonb, avatar bytea, score numeric(10,2));
  CREATE TABLE ${schema}.posts (id serial PRIMARY KEY, author_id text REFERENCES ${schema}.users(id), parent_id int REFERENCES ${schema}.posts(id),
    title text NOT NULL, title_upper text GENERATED ALWAYS AS (upper(title)) STORED);
  CREATE TABLE ${schema}.user_sessions (id text PRIMARY KEY, user_id text REFERENCES ${schema}.users(id) ON DELETE CASCADE);
`;

async function snapshotOf(pg: PGlite, schema: string): Promise<string[]> {
  const users = await pg.query<{ j: string }>(`SELECT json_agg(row_to_json(u) ORDER BY u.id)::text AS j FROM ${schema}.users u`);
  const posts = await pg.query<{ j: string }>(`SELECT json_agg(row_to_json(p) ORDER BY p.id)::text AS j FROM ${schema}.posts p`);
  return [users.rows[0].j, posts.rows[0].j];
}

async function backupOf(pg: PGlite, schema: string) {
  const objects = new Map<string, Buffer>();
  const manifest = await exportBackup(pgliteDb(pg), configFor(schema), { put: async (_id, name, body) => void objects.set(name, body) });
  return { manifest, objects, read: async (name: string) => objects.get(name) ?? null };
}

test("export then restore round-trips every type exactly, in FK order, and resets sequences", async () => {
  const pg = new PGlite();
  await pg.exec(DDL("app_src") + DDL("app_test"));
  await pg.exec(`
    INSERT INTO app_src.users (id, email, created_at, tags, meta, avatar, score) VALUES
      ('u1', 'a@example.com', '2026-10-15 02:20:00.123', '{x,"y z"}', '{"k":[1,2,{"n":null}]}', '\xdeadbeef', 12.5),
      ('u2', 'b@example.com', '2026-01-01 00:00:00', '{}', NULL, NULL, NULL);
    INSERT INTO app_src.posts (author_id, parent_id, title) VALUES ('u1', NULL, 'root'), ('u2', 1, 'child'), ('u1', 2, 'grand "quoted" \ line');
    INSERT INTO app_src.user_sessions VALUES ('s1', 'u1');
  `);
  const db = pgliteDb(pg);
  const { manifest, objects, read } = await backupOf(pg, "app_src");

  assert.deepEqual(manifest.tables.map((table) => [table.name, table.rows]), [["posts", 3], ["users", 2]]);
  assert.deepEqual(manifest.excluded, ["user_sessions"]);
  assert.ok(!objects.has("user_sessions.ndjson.gz.enc"), "excluded tables are never written");
  assert.equal(parseManifest(JSON.parse(JSON.stringify(manifest)))?.id, manifest.id);

  const data = await loadBackup(manifest, read, [OTHER_KEY, KEY]);
  const result = await restoreBackup(db, manifest, data, { targetSchema: "app_test", mode: "empty" });
  assert.deepEqual(result.tables, [{ name: "posts", rows: 3 }, { name: "users", rows: 2 }]);
  assert.equal(result.sequencesReset, 1);
  assert.deepEqual(await snapshotOf(pg, "app_test"), await snapshotOf(pg, "app_src"));

  const next = await pg.query<{ id: number }>("INSERT INTO app_test.posts (title) VALUES ('new') RETURNING id");
  assert.equal(next.rows[0].id, 4, "the serial continues after the restored rows");

  await assert.rejects(restoreBackup(db, manifest, data, { targetSchema: "app_test", mode: "empty" }), /not empty: posts, users/);
  const again = await restoreBackup(db, manifest, data, { targetSchema: "app_test", mode: "replace" });
  assert.equal(again.tables.length, 2);
  assert.deepEqual(await snapshotOf(pg, "app_test"), await snapshotOf(pg, "app_src"));
  await pg.close();
});

test("restore refuses a tampered, swapped or wrongly keyed object before writing anything", async () => {
  const pg = new PGlite();
  await pg.exec(DDL("app_src"));
  await pg.exec("INSERT INTO app_src.users (id, email) VALUES ('u1', 'a@example.com')");
  const { manifest, objects, read } = await backupOf(pg, "app_src");

  await assert.rejects(loadBackup(manifest, read, [OTHER_KEY]), /sealed with key/);
  const tampered = Buffer.from(objects.get("users.ndjson.gz.enc")!);
  tampered[tampered.length - 1] ^= 1;
  await assert.rejects(loadBackup(manifest, async (name) => (name.startsWith("users") ? tampered : read(name)), [KEY]), /failed authentication/);
  await assert.rejects(loadBackup(manifest, async (name) => (name.startsWith("users") ? objects.get("posts.ndjson.gz.enc")! : read(name)), [KEY]), /failed authentication/);
  await assert.rejects(loadBackup({ ...manifest, tables: manifest.tables.map((table) => ({ ...table, rows: table.rows + 1 })) }, read, [KEY]), /manifest says/);
  await pg.close();
});

test("restore stops on columns the target lacks unless drift is allowed", async () => {
  const pg = new PGlite();
  await pg.exec(DDL("app_src") + DDL("app_test"));
  await pg.exec("INSERT INTO app_src.users (id, email, score) VALUES ('u1', 'a@example.com', 1); ALTER TABLE app_test.users DROP COLUMN score;");
  const db = pgliteDb(pg);
  const { manifest, read } = await backupOf(pg, "app_src");
  const data = await loadBackup(manifest, read, [KEY]);
  await assert.rejects(restoreBackup(db, manifest, data, { targetSchema: "app_test", mode: "empty" }), /users\.score/);
  const result = await restoreBackup(db, manifest, data, { targetSchema: "app_test", mode: "empty", allowColumnDrift: true });
  assert.deepEqual(result.droppedColumns, ["users.score"]);
  await pg.close();
});

test("seal binds key, backup and table", () => {
  const id = newBackupId(new Date("2026-10-15T02:20:00Z"));
  const sealed = seal(Buffer.from("rows"), KEY, id, "users");
  assert.equal(unseal(sealed, KEY, id, "users").toString(), "rows");
  assert.throws(() => unseal(sealed, OTHER_KEY, id, "users"), /failed authentication/);
  assert.throws(() => unseal(sealed, KEY, id, "posts"), /failed authentication/);
  assert.throws(() => unseal(Buffer.from("nope"), KEY, id, "users"), /not a sealed/);
});

test("backup ids sort by time and parse back", () => {
  const id = newBackupId(new Date("2026-10-15T02:20:05.900Z"));
  assert.match(id, /^20261015T022005Z-[0-9a-f]{6}$/);
  assert.equal(backupIdDate(id)?.toISOString(), "2026-10-15T02:20:05.000Z");
  assert.equal(backupIdDate("../etc"), null);
  assert.equal(isoWeek(new Date("2026-01-01T00:00:00Z")), "2026-W01");
  assert.equal(isoWeek(new Date("2027-01-01T00:00:00Z")), "2026-W53");
});

test("retention keeps the newest N, one per recent week and month, and never the newest", () => {
  const ids = Array.from({ length: 70 }, (_, day) => newBackupId(new Date(Date.UTC(2026, 7, 1 + day, 2, 20))));
  const expired = new Set(expiredBackups(ids, { daily: 3, weekly: 2, monthly: 2 }));
  const kept = ids.filter((id) => !expired.has(id)).map((id) => backupIdDate(id)!.toISOString().slice(0, 10));
  assert.deepEqual(kept.sort(), ["2026-09-30", "2026-10-04", "2026-10-07", "2026-10-08", "2026-10-09"]);
  assert.deepEqual(expiredBackups([ids[0]], { daily: 0, weekly: 0, monthly: 0 }), []);
  assert.deepEqual(expiredBackups(["not-an-id", ...ids.slice(0, 2)], { daily: 1, weekly: 0, monthly: 0 }), [ids[0]]);
});

test("parentsFirst orders parents before children and reports cycles", () => {
  assert.deepEqual(parentsFirst(["posts", "users", "roles"], [["users", "roles"], ["posts", "users"], ["posts", "posts"]]), { order: ["roles", "users", "posts"], cyclic: [] });
  assert.deepEqual(parentsFirst(["a", "b", "c"], [["a", "b"], ["b", "a"]]), { order: ["c", "a", "b"], cyclic: ["a", "b"] });
});

test("ident refuses anything that could break out of quotes", () => {
  assert.equal(ident("admin-panel"), '"admin-panel"');
  for (const bad of ['a"b', "a b", "a;b", "", "1a"]) assert.throws(() => ident(bad));
});

test("config: off when nothing is set, a list of problems when half set, keys as hex or base64", () => {
  const off = backupConfigFromEnv({}, "public");
  assert.ok(!off.ok && !off.configured);
  const half = backupConfigFromEnv({ BACKUP_S3_BUCKET: "b" }, "public");
  assert.ok(!half.ok && half.configured && half.problems.some((problem) => problem.startsWith("BACKUP_S3_ENDPOINT")));
  const full = backupConfigFromEnv(
    {
      BACKUP_S3_ENDPOINT: "https://storage.example/",
      BACKUP_S3_BUCKET: "sahan-backups",
      BACKUP_S3_ACCESS_KEY_ID: "id",
      BACKUP_S3_SECRET_ACCESS_KEY: "secret",
      BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      BACKUP_EXCLUDE_TABLES: "webhook_deliveries",
      BACKUP_RETENTION_DAILY: "0",
    },
    "public"
  );
  assert.ok(full.ok);
  assert.equal(full.config.account.endpoint, "https://storage.example");
  assert.equal(full.config.prefix, "db");
  assert.ok(full.config.excludeTables.includes("user_sessions") && full.config.excludeTables.includes("webhook_deliveries"));
  assert.equal(full.config.retention.daily, 1, "always keeps at least one");
  assert.equal(parseEncryptionKey("too-short"), null);
  const bad = backupConfigFromEnv({ BACKUP_S3_ENDPOINT: "http://x", BACKUP_S3_BUCKET: "b", BACKUP_S3_ACCESS_KEY_ID: "i", BACKUP_S3_SECRET_ACCESS_KEY: "s", BACKUP_ENCRYPTION_KEY: "x", BACKUP_EXCLUDE_TABLES: "drop table" }, "public");
  assert.ok(!bad.ok && bad.problems.length === 3);
});
