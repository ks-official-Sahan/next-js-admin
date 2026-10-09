import type { Prisma } from "@prisma/client";

import type { AuditCursor, AuditFilters } from "../audit";

// The audit filter as a Prisma where clause, with keyset paging on
// (createdAt, id). Pure, so it is unit tested.

export const AUDIT_ORDER = [{ createdAt: "desc" }, { id: "desc" }] as const;

export function buildAuditWhere(filters: AuditFilters, cursor: AuditCursor | null = null): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];

  if (filters.actor) {
    and.push({ OR: [{ actorEmail: { contains: filters.actor, mode: "insensitive" } }, { actorId: filters.actor }] });
  }
  if (filters.action) {
    and.push(
      filters.action.endsWith("*")
        ? { action: { startsWith: filters.action.slice(0, -1) } }
        : { action: filters.action }
    );
  }
  if (filters.hideActorRole) {
    // IS DISTINCT FROM: a row with no snapshot (a system job) stays visible.
    and.push({ OR: [{ actorRole: null }, { actorRole: { not: filters.hideActorRole } }] });
  }
  if (filters.entityType) and.push({ entityType: filters.entityType });
  if (filters.entityId) and.push({ entityId: filters.entityId });
  if (filters.from || filters.to) {
    and.push({ createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } });
  }
  if (cursor) {
    and.push({
      OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}
