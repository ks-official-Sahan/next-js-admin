import "server-only";

import { hiddenAuditRole } from "@/lib/auth/mask";
import type { RoleName } from "@/lib/auth/permissions";
import { repos } from "@/lib/data";
import type { AuditEntry } from "@/lib/data/audit";

import { encodeCursor, type AuditCursor, type AuditFilters } from "./audit-filters";

// The data side of the audit screen and the CSV export: paging over the audit
// repository. Filters and cursors come from audit-filters.ts, which is unit tested.

export type AuditRow = AuditEntry;

/**
 * What a viewer may read: with developer masking on (lib/auth/mask.ts),
 * everyone below the super role never sees a row a developer wrote (the
 * actorRole snapshot), masked or not.
 */
export function auditScope(filters: AuditFilters, viewer: { role: RoleName }): AuditFilters {
  const hidden = hiddenAuditRole(viewer);
  return hidden ? { ...filters, hideActorRole: hidden } : filters;
}

/** One page, newest first. `nextCursor` is set when there is more. */
export async function queryAudit(
  filters: AuditFilters,
  cursor: AuditCursor | null,
  limit: number
): Promise<{ rows: AuditRow[]; nextCursor: string | null }> {
  const found = await repos.audit.page(filters, cursor, limit + 1);
  const rows = found.slice(0, limit);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: found.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

/** Distinct action names of the rows the viewer may read, for the filter's suggestions. */
export async function auditActionNames(viewer: { role: RoleName }): Promise<string[]> {
  return repos.audit.actionNames(200, hiddenAuditRole(viewer));
}

export const AUDIT_EXPORT_MAX_ROWS = 10_000;
const EXPORT_PAGE = 1000;

/** Up to 10,000 rows for the export, newest first, fetched in pages so memory stays flat. */
export async function exportAuditRows(filters: AuditFilters): Promise<{ rows: AuditRow[]; truncated: boolean }> {
  const rows: AuditRow[] = [];
  let cursor: AuditCursor | null = null;
  while (rows.length < AUDIT_EXPORT_MAX_ROWS) {
    const page = await repos.audit.page(filters, cursor, EXPORT_PAGE);
    rows.push(...page);
    const last = page[page.length - 1];
    if (page.length < EXPORT_PAGE || !last) return { rows, truncated: false };
    cursor = { createdAt: last.createdAt, id: last.id };
  }
  return { rows: rows.slice(0, AUDIT_EXPORT_MAX_ROWS), truncated: true };
}
