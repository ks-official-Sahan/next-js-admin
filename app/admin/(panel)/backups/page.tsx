import type { Metadata } from "next";

import { RunBackupForm } from "@/components/admin/backups/BackupForms";
import EmptyState from "@/components/admin/ui/EmptyState";
import { cardClass, tableClass } from "@/components/admin/ui/styles";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { requirePermission } from "@/lib/auth/dal";
import { currentBackupConfig, lastBackupStatus } from "@/lib/backup/run";
import { listStoredBackups, type StoredBackup } from "@/lib/backup/store";

export const metadata: Metadata = { title: "Backups" };
// "Back up now" runs inside this page's function.
export const maxDuration = 60;

// Read outside the component: a server render is one request, and this is its clock.
const clock = () => Date.now();

/** The daily cron runs at 02:20 UTC; older than this means at least one run was missed. */
const STALE_MS = 36 * 60 * 60 * 1000;
const BACKUPS_SHOWN = 60;

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`);

export default async function BackupsPage() {
  await requirePermission("manageSettings");
  const nowMs = clock();
  const resolved = currentBackupConfig();
  const [status, listing] = await Promise.all([
    lastBackupStatus(),
    resolved.ok
      ? listStoredBackups(resolved.config.account, resolved.config.prefix).then(
          (backups) => ({ ok: true as const, backups }),
          (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) })
        )
      : null,
  ]);
  const backups: StoredBackup[] = listing?.ok ? listing.backups : [];
  const newest = backups.find((backup) => backup.complete);
  const stale = resolved.ok && listing?.ok && (!newest || nowMs - Date.parse(newest.createdAt) > STALE_MS);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Backups</h1>
        <p className="text-sm text-muted-foreground">
          A full, encrypted copy of the site&apos;s database schema goes to the backup bucket every night at 02:20 UTC, and whenever you press
          the button below. Each backup is one consistent snapshot. Restores run from the command line, never from this page; see
          docs/backups.md.
        </p>
      </header>

      {!resolved.ok ? (
        <div role="alert" className="space-y-1 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          <p>{resolved.configured ? "Backups are set up incompletely:" : "Backups are off: no BACKUP_S3_* variables are set on the server."}</p>
          {resolved.configured ? (
            <ul className="list-disc pl-5">
              {resolved.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {listing && !listing.ok ? (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          The backup bucket could not be listed: {listing.error}
        </p>
      ) : null}
      {stale ? (
        <p role="alert" className="rounded-md border border-amber-500/40 p-3 text-sm text-amber-700 dark:text-amber-400">
          {newest ? `The newest backup is ${relativeTime(new Date(newest.createdAt), nowMs)} old.` : "There is no complete backup yet."} Check
          the cron logs, or back up now.
        </p>
      ) : null}

      <section className={`${cardClass} space-y-3`} aria-labelledby="last-run-heading">
        <h2 id="last-run-heading" className="text-lg font-semibold">
          Last run
        </h2>
        {status ? (
          <p className="text-sm">
            <span className={status.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>{status.ok ? "Succeeded" : "Failed"}</span>{" "}
            {relativeTime(new Date(status.at), nowMs)} ({status.trigger}, {Math.round(status.durationMs / 100) / 10} s)
            {status.ok ? `: ${status.tables} tables, ${status.rows} rows, ${size(status.bytes ?? 0)}.` : `: ${status.error}`}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No run recorded yet.</p>
        )}
        <RunBackupForm disabled={!resolved.ok} />
      </section>

      <section className={`${cardClass} space-y-4`} aria-labelledby="backups-heading">
        <h2 id="backups-heading" className="text-lg font-semibold">
          Stored backups
        </h2>
        {backups.length === 0 ? (
          <EmptyState title="No backups yet" description="The first one is made by tonight's cron, or by the button above." />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Backup</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Made</th>
                  <th scope="col" className="py-2 pr-4 font-medium">State</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Objects</th>
                  <th scope="col" className="py-2 font-medium">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {backups.slice(0, BACKUPS_SHOWN).map((backup) => (
                  <tr key={backup.id}>
                    <td className="py-2 pr-4 font-mono text-xs">{backup.id}</td>
                    <td className="py-2 pr-4" title={formatDateTime(backup.createdAt)}>
                      {relativeTime(new Date(backup.createdAt), nowMs)}
                    </td>
                    <td className="py-2 pr-4">{backup.complete ? "Complete" : "Unfinished (removed after a day)"}</td>
                    <td className="py-2 pr-4">{backup.objects}</td>
                    <td className="py-2">{size(backup.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
