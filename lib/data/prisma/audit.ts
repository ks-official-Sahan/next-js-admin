import type { Prisma } from "@prisma/client";

import type { AuditRepo, AuditRow } from "../audit";
import { AUDIT_ORDER, buildAuditWhere } from "./audit-where";
import type { DbClient } from "./client";

function json(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null ? undefined : (value as Prisma.InputJsonValue);
}

function data(row: AuditRow): Prisma.AuditLogUncheckedCreateInput {
  return { ...row, before: json(row.before), after: json(row.after), meta: json(row.meta) };
}

const select = {
  id: true,
  createdAt: true,
  actorId: true,
  actorEmail: true,
  actorRole: true,
  action: true,
  entityType: true,
  entityId: true,
  ip: true,
  userAgent: true,
  before: true,
  after: true,
  meta: true,
} as const;

export function auditRepo(client: DbClient): AuditRepo {
  return {
    async create(row) {
      await client.auditLog.create({ data: data(row) });
    },
    async createMany(rows) {
      if (rows.length === 0) return;
      await client.auditLog.createMany({ data: rows.map(data) });
    },
    page(filters, cursor, take) {
      return client.auditLog.findMany({ where: buildAuditWhere(filters, cursor), orderBy: [...AUDIT_ORDER], take, select });
    },
    async actionNames(limit, hideActorRole) {
      const rows = await client.auditLog.findMany({
        where: hideActorRole ? buildAuditWhere({ hideActorRole }) : undefined,
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
        take: limit,
      });
      return rows.map((row) => row.action);
    },
  };
}
