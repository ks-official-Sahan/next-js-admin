import type { Metadata } from "next";
import Link from "next/link";

import EmptyState from "@/components/admin/ui/EmptyState";
import { badgeClass, buttonVariants, fieldClass, tableClass, tdClass, thClass } from "@/components/admin/ui/styles";
import { auditQueryString, parseAuditFilters } from "@/lib/admin/audit-filters";
import { auditActionNames, queryAudit } from "@/lib/admin/audit-query";
import { diffValues } from "@/lib/admin/diff";
import { formatDateTime } from "@/lib/admin/format";
import { hasPermission, requirePermission } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Audit log" };

function Diff({ before, after, meta }: { before: unknown; after: unknown; meta: unknown }) {
  const rows = diffValues(before, after);
  const hasMeta = meta !== null && meta !== undefined && Object.keys(meta as object).length > 0;
  if (rows.length === 0 && !hasMeta) return <span className="text-xs text-muted-foreground">No details</span>;

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {rows.length > 0 ? `${rows.length} ${rows.length === 1 ? "change" : "changes"}` : "Details"}
      </summary>
      <div className="mt-2 space-y-2">
        {rows.length > 0 ? (
          <table className="w-full text-left">
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="pr-3 font-medium">Field</th>
                <th scope="col" className="pr-3 font-medium">Before</th>
                <th scope="col" className="font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.path} className="border-t border-border">
                  <th scope="row" className="py-1 pr-3 font-mono font-normal">{row.path}</th>
                  <td className="py-1 pr-3 font-mono text-red-700 dark:text-red-400">
                    {row.kind === "added" ? "" : row.before}
                  </td>
                  <td className="py-1 font-mono text-emerald-700 dark:text-emerald-400">
                    {row.kind === "removed" ? "" : row.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {hasMeta ? (
          <pre className="max-w-full overflow-x-auto rounded bg-muted p-2 font-mono">
            {JSON.stringify(meta, null, 2)}
          </pre>
        ) : null}
      </div>
    </details>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("viewAuditLogs");
  const params = await searchParams;
  const { filters, cursor, limit } = parseAuditFilters(params);

  const [{ rows, nextCursor }, actions] = await Promise.all([queryAudit(filters, cursor, limit), auditActionNames()]);
  const mayExport = hasPermission(actor, "exportData");
  const filtered = Object.keys(filters).length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Who did what, and when. Rows are never edited. Passwords, tokens and codes are removed before a row is
            written.
          </p>
        </div>
        {mayExport ? (
          <a href={`/api/admin/export/audit${auditQueryString(filters)}`} className={buttonVariants.secondary} download>
            Export CSV
          </a>
        ) : null}
      </div>

      <form method="get" className="grid gap-3 rounded-lg border border-border bg-card p-4 s640:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="actor" className="text-xs font-medium">Actor email</label>
          <input id="actor" name="actor" defaultValue={filters.actor} maxLength={254} className={`${fieldClass} mt-1`} />
        </div>
        <div>
          <label htmlFor="action" className="text-xs font-medium">Action</label>
          <input
            id="action"
            name="action"
            list="audit-actions"
            defaultValue={filters.action}
            maxLength={100}
            placeholder="auth.* or user.created"
            className={`${fieldClass} mt-1`}
          />
          <datalist id="audit-actions">
            {actions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="from" className="text-xs font-medium">From</label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={filters.from?.toISOString().slice(0, 10)}
            className={`${fieldClass} mt-1`}
          />
        </div>
        <div>
          <label htmlFor="to" className="text-xs font-medium">To</label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={filters.to?.toISOString().slice(0, 10)}
            className={`${fieldClass} mt-1`}
          />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonVariants.primary}>Filter</button>
          {filtered ? (
            <Link href="/admin/audit" className={buttonVariants.secondary}>Clear</Link>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No rows match" : "Nothing recorded yet"}
          description={
            filtered
              ? "Try a wider date range or fewer filters."
              : "Sign-ins and every change made in the admin appear here."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className={tableClass}>
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th scope="col" className={thClass}>When</th>
                <th scope="col" className={thClass}>Actor</th>
                <th scope="col" className={thClass}>Action</th>
                <th scope="col" className={thClass}>Target</th>
                <th scope="col" className={thClass}>Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={`${tdClass} whitespace-nowrap text-xs`}>{formatDateTime(row.createdAt)}</td>
                  <td className={tdClass}>
                    <div className="text-sm">{row.actorEmail ?? "System"}</div>
                    {row.ip ? <div className="text-xs text-muted-foreground">{row.ip}</div> : null}
                  </td>
                  <td className={tdClass}>
                    <span className={`${badgeClass} font-mono`}>{row.action}</span>
                  </td>
                  <td className={`${tdClass} text-xs`}>
                    {row.entityType}
                    {row.entityId ? <div className="font-mono text-muted-foreground">{row.entityId}</div> : null}
                  </td>
                  <td className={tdClass}>
                    <Diff before={row.before} after={row.after} meta={row.meta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Pages" className="flex items-center justify-between text-sm">
        {cursor ? (
          <Link
            href={`/admin/audit${auditQueryString(filters)}`}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Back to newest
          </Link>
        ) : (
          <span />
        )}
        {nextCursor ? (
          <Link
            href={`/admin/audit${auditQueryString(filters, { cursor: nextCursor })}`}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Older rows
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
