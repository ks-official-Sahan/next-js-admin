import "server-only";

import { db } from "@/lib/db/prisma";

import { AUDIT_ORDER, buildAuditWhere, encodeCursor, type AuditCursor, type AuditFilters } from "./audit-filters";

// The database side of the audit screen and the CSV export. The where clause and
// the paging come from audit-filters.ts, which is unit tested.

export interface AuditRow {
  id: string;
  createdAt: Date;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  before: unknown;
  after: unknown;
  meta: unknown;
}

const select = {
  id: true,
  createdAt: true,
  actorId: true,
  actorEmail: true,
  action: true,
  entityType: true,
  entityId: true,
  ip: true,
  userAgent: true,
  before: true,
  after: true,
  meta: true,
} as const;

/** One page, newest first. `nextCursor` is set when there is more. */
export async function queryAudit(
  filters: AuditFilters,
  cursor: AuditCursor | null,
  limit: number
): Promise<{ rows: AuditRow[]; nextCursor: string | null }> {
  const found = await db.auditLog.findMany({
    where: buildAuditWhere(filters, cursor),
    orderBy: [...AUDIT_ORDER],
    take: limit + 1,
    select,
  });
  const rows = found.slice(0, limit);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: found.length > limit && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

/** Distinct action names, for the filter's suggestions. */
export async function auditActionNames(): Promise<string[]> {
  const rows = await db.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
    take: 200,
  });
  return rows.map((row) => row.action);
}

export const AUDIT_EXPORT_MAX_ROWS = 10_000;
const EXPORT_PAGE = 1000;

/** Up to 10,000 rows for the export, newest first, fetched in pages so memory stays flat. */
export async function exportAuditRows(filters: AuditFilters): Promise<{ rows: AuditRow[]; truncated: boolean }> {
  const rows: AuditRow[] = [];
  let cursor: AuditCursor | null = null;
  while (rows.length < AUDIT_EXPORT_MAX_ROWS) {
    const page: AuditRow[] = await db.auditLog.findMany({
      where: buildAuditWhere(filters, cursor),
      orderBy: [...AUDIT_ORDER],
      take: EXPORT_PAGE,
      select,
    });
    rows.push(...page);
    const last = page[page.length - 1];
    if (page.length < EXPORT_PAGE || !last) return { rows, truncated: false };
    cursor = { createdAt: last.createdAt, id: last.id };
  }
  return { rows: rows.slice(0, AUDIT_EXPORT_MAX_ROWS), truncated: true };
}
