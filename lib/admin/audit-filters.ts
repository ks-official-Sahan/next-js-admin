import type { AuditCursor, AuditFilters } from "@/lib/data/audit";

export type { AuditCursor, AuditFilters };

// The audit log screen and the CSV export share one filter: parse the query
// string into validated filters and page by an opaque (createdAt, id) cursor.
// The database query itself is the audit repository's (lib/data). Pure, so it
// is unit tested (design notes, step 8).

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_MAX_PAGE_SIZE = 200;

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined =>
  (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

const limited = (value: string | undefined, max: number, pattern?: RegExp) =>
  value && value.length <= max && (!pattern || pattern.test(value)) ? value : undefined;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value || !DAY.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function encodeCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify({ t: cursor.createdAt.getTime(), i: cursor.id })).toString("base64url");
}

export function decodeCursor(value: string | undefined): AuditCursor | null {
  if (!value || value.length > 200) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== "number" || typeof parsed.i !== "string" || parsed.i.length > 100) return null;
    const createdAt = new Date(parsed.t);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: parsed.i };
  } catch {
    return null;
  }
}

export function parseAuditFilters(params: Params): {
  filters: AuditFilters;
  cursor: AuditCursor | null;
  limit: number;
} {
  const filters: AuditFilters = {
    actor: limited(one(params.actor), 254),
    action: limited(one(params.action), 100, /^[A-Za-z0-9_.*-]+$/),
    entityType: limited(one(params.entityType), 60, /^[A-Za-z0-9_.-]+$/),
    entityId: limited(one(params.entityId), 100, /^[A-Za-z0-9_.:-]+$/),
    from: day(one(params.from), false),
    to: day(one(params.to), true),
  };
  if (filters.from && filters.to && filters.from > filters.to) {
    [filters.from, filters.to] = [day(one(params.to), false)!, day(one(params.from), true)!];
  }
  for (const key of Object.keys(filters) as Array<keyof AuditFilters>) {
    if (filters[key] === undefined) delete filters[key];
  }

  const requested = Number.parseInt(one(params.limit) ?? "", 10);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 10), AUDIT_MAX_PAGE_SIZE) : AUDIT_PAGE_SIZE;

  return { filters, cursor: decodeCursor(one(params.cursor)), limit };
}

/** Query string for a filter set, used by links and the export button. */
export function auditQueryString(filters: AuditFilters, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.action) params.set("action", filters.action);
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.entityId) params.set("entityId", filters.entityId);
  if (filters.from) params.set("from", filters.from.toISOString().slice(0, 10));
  if (filters.to) params.set("to", filters.to.toISOString().slice(0, 10));
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
}
