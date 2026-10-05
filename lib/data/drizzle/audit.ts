import { and, asc, desc, eq, gte, ilike, like, lt, lte, or, type SQL } from "drizzle-orm";

import { auditLogs } from "@/lib/db/schema";

import type { AuditCursor, AuditFilters, AuditRepo, AuditRow } from "../audit";
import { containsPattern, prefixPattern, type DbClient } from "./client";

/** The audit filter as a Drizzle condition, with keyset paging on (createdAt, id). */
export function buildAuditWhere(filters: AuditFilters, cursor: AuditCursor | null = null): SQL | undefined {
  return and(
    filters.actor ? or(ilike(auditLogs.actorEmail, containsPattern(filters.actor)), eq(auditLogs.actorId, filters.actor)) : undefined,
    filters.action
      ? filters.action.endsWith("*")
        ? like(auditLogs.action, prefixPattern(filters.action.slice(0, -1)))
        : eq(auditLogs.action, filters.action)
      : undefined,
    filters.entityType ? eq(auditLogs.entityType, filters.entityType) : undefined,
    filters.entityId ? eq(auditLogs.entityId, filters.entityId) : undefined,
    filters.from ? gte(auditLogs.createdAt, filters.from) : undefined,
    filters.to ? lte(auditLogs.createdAt, filters.to) : undefined,
    cursor ? or(lt(auditLogs.createdAt, cursor.createdAt), and(eq(auditLogs.createdAt, cursor.createdAt), lt(auditLogs.id, cursor.id))) : undefined
  );
}

const values = (row: AuditRow) => ({ ...row, before: row.before ?? null, after: row.after ?? null, meta: row.meta ?? null });

export function auditRepo(client: DbClient): AuditRepo {
  return {
    async create(row) {
      await client.insert(auditLogs).values(values(row));
    },
    async createMany(rows) {
      if (rows.length === 0) return;
      await client.insert(auditLogs).values(rows.map(values));
    },
    page(filters, cursor, take) {
      return client
        .select()
        .from(auditLogs)
        .where(buildAuditWhere(filters, cursor))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(take);
    },
    async actionNames(limit) {
      const rows = await client.selectDistinct({ action: auditLogs.action }).from(auditLogs).orderBy(asc(auditLogs.action)).limit(limit);
      return rows.map((row) => row.action);
    },
  };
}
