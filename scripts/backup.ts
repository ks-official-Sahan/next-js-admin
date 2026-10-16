// Backup command line. Run from the repo root:
//   pnpm db:backup run                    make a backup now
//   pnpm db:backup list                   list backups in the bucket
//   pnpm db:backup verify <id>            download, decrypt and checksum one (no database writes)
//   pnpm db:backup restore <id> --schema <name> [--replace] [--allow-column-drift] [--yes-replace-live]
//
// Restore writes only to a schema this project owns (lib/db/url.ts
// ALLOWED_SCHEMAS); restoring into the live schema also needs
// --yes-replace-live. Restore into public_test first, check it, then decide.
// Before replacing live data, create a Neon branch (instant) so the current
// state stays recoverable whatever happens. See docs/backups.md.
import { loadBackup, restoreBackup } from "../lib/backup/restore";
import { backupDb } from "../lib/data";
import { currentBackupConfig, runBackup } from "../lib/backup/run";
import { listStoredBackups, objectKey, readManifest, readObject } from "../lib/backup/store";
import { assertAllowedSchema, DEFAULT_SCHEMA } from "../lib/db/url";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const USAGE = "Usage: pnpm db:backup run | list | verify <id> | restore <id> --schema <name> [--replace] [--allow-column-drift] [--yes-replace-live]";

async function main(): Promise<void> {
  const [command, id] = args;
  if (!["run", "list", "verify", "restore"].includes(command)) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }
  const resolved = currentBackupConfig();
  if (!resolved.ok) throw new Error(`Backups are not configured:\n- ${resolved.problems.join("\n- ")}`);
  const { config } = resolved;

  if (command === "run") {
    const status = await runBackup("cli", { timeoutMs: 300_000 });
    if (!status.ok) throw new Error(status.error);
    console.log(`backup ${status.id}: ${status.tables} tables, ${status.rows} rows, ${mb(status.bytes ?? 0)}, ${status.durationMs} ms, ${status.pruned} pruned`);
    return;
  }

  if (command === "list") {
    const backups = await listStoredBackups(config.account, config.prefix);
    if (backups.length === 0) console.log("no backups");
    for (const backup of backups) console.log(`${backup.id}  ${backup.complete ? "complete  " : "INCOMPLETE"}  ${backup.objects} objects  ${mb(backup.bytes)}`);
    return;
  }

  if (!id) throw new Error(`Usage: pnpm db:backup ${command} <id>`);
  const manifest = await readManifest(config.account, config.prefix, id);
  if (!manifest) throw new Error(`No complete backup ${id} (or its manifest is not readable)`);
  const data = await loadBackup(manifest, (name) => readObject(config.account, objectKey(config.prefix, id, name)), [config.key, ...config.previousKeys]);
  const rows = [...data.values()].reduce((sum, lines) => sum + lines.length, 0);
  console.log(`verified ${manifest.id}: ${manifest.tables.length} tables, ${rows} rows, schema ${manifest.schema}, Postgres ${manifest.postgres}`);
  if (command === "verify") return;

  const target = option("--schema");
  if (!target) throw new Error("Name the target schema with --schema (for example --schema public_test)");
  assertAllowedSchema(target);
  if (target === DEFAULT_SCHEMA && !flag("--yes-replace-live")) {
    throw new Error(`"${target}" is the live schema. Restore into public_test first; to replace live data anyway, create a Neon branch, then add --yes-replace-live.`);
  }
  const result = await restoreBackup(backupDb, manifest, data, {
    targetSchema: target,
    mode: flag("--replace") ? "replace" : "empty",
    allowColumnDrift: flag("--allow-column-drift"),
  });
  console.log(`restored ${result.tables.length} tables into ${result.schema}; ${result.sequencesReset} sequences reset`);
  if (result.droppedColumns.length > 0) console.log(`dropped columns: ${result.droppedColumns.join(", ")}`);
  if (target === DEFAULT_SCHEMA) console.log("Live data replaced: purge the caches (Admin > Settings > Clear system cache) so pages show it.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  // The ORM pool keeps sockets open; exit once the command is done.
  .finally(() => process.exit());
