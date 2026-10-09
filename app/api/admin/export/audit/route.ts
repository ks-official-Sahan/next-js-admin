import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/admin/audit";
import { auditQueryString, parseAuditFilters } from "@/lib/admin/audit-filters";
import { auditScope, exportAuditRows } from "@/lib/admin/audit-query";
import { toCsv } from "@/lib/admin/csv";
import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { isCrossSiteFetch } from "@/lib/security/fetch-site";

// CSV of the audit log, with the same filters as the screen. It needs two
// permissions (viewAuditLogs and exportData), answers 404 to everyone else, and
// is itself audited (design notes, step 8).

export const dynamic = "force-dynamic";

const HEADERS = ["time (UTC)", "actor", "action", "entity type", "entity id", "ip", "user agent", "before", "after", "meta"];

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  // Same rule as the leads export: refuse a cross-site top-level navigation.
  if (isCrossSiteFetch(request.headers.get("sec-fetch-site"))) return notFound();

  const user = await getOptionalUser();
  if (!user || user.mustChangePassword) return notFound();
  if (!hasPermission(user, "viewAuditLogs") || !hasPermission(user, "exportData")) return notFound();

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const { filters } = parseAuditFilters(params);
  const { rows, truncated } = await exportAuditRows(auditScope(filters, user));

  await audit({
    action: "audit.exported",
    actor: user,
    entityType: "AuditLog",
    meta: { rows: rows.length, truncated, filters: auditQueryString(filters) || null },
  });

  const body = toCsv(
    HEADERS,
    rows.map((row) => [
      row.createdAt,
      row.actorEmail,
      row.action,
      row.entityType,
      row.entityId,
      row.ip,
      row.userAgent,
      row.before,
      row.after,
      row.meta,
    ])
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
}
