"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/actions/guard";
import type { ActionState } from "@/lib/actions/state";
import { done, fail } from "@/lib/actions/state";
import { auditSafe } from "@/lib/admin/audit";
import { NOT_CONFIGURED, runBackup } from "@/lib/backup/run";

// "Back up now" on /admin/backups. Same gate as the site's other operational
// settings (manageSettings). A backup changes no rows, so its audit row is
// written on its own (there is no mutation transaction to share), and a
// failed audit write never hides the backup's own outcome.

const BACKUPS_PATH = "/admin/backups";

export async function runBackupAction(_previous: ActionState, _formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("manageSettings");
  if (!auth.ok) return fail(auth.error);

  const status = await runBackup("manual");
  // Nothing was attempted (the button is disabled in that state anyway): no audit row.
  if (!status.ok && status.error?.startsWith(NOT_CONFIGURED)) return fail(status.error);
  await auditSafe({
    action: status.ok ? "backup.created" : "backup.failed",
    actor: auth.user,
    entityType: "Backup",
    entityId: status.id ?? null,
    after: status.ok ? { tables: status.tables, rows: status.rows, bytes: status.bytes, pruned: status.pruned } : { error: status.error },
  });
  revalidatePath(BACKUPS_PATH);
  if (!status.ok) return fail(status.error ?? "The backup failed.");
  return done(`Backup ${status.id} saved: ${status.tables} tables, ${status.rows} rows.`);
}
