import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/admin/audit";
import { toCsv } from "@/lib/admin/csv";
import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/prisma";
import { isCrossSiteFetch } from "@/lib/security/fetch-site";

export const dynamic = "force-dynamic";

const HEADERS = [
  "ID",
  "Name",
  "Email",
  "Phone",
  "Topic",
  "Message",
  "Status",
  "Spam Score",
  "Source",
  "Created",
  "IP Hash",
  "User Agent",
  "Notes",
  "Assignee",
];

const MAX_ROWS = 10000;

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  // A side-effecting, audited GET must not be reachable by a cross-site top
  // level navigation (an <img>, <a>, or auto-submitting form on another
  // site) — same 404 as any other unauthorized admin surface.
  if (isCrossSiteFetch(request.headers.get("sec-fetch-site"))) return notFound();

  const user = await getOptionalUser();
  if (!user || user.mustChangePassword) return notFound();
  if (!hasPermission(user, "viewLeads") || !hasPermission(user, "exportData")) return notFound();

  try {
    const inquiries = await db.inquiry.findMany({
      take: MAX_ROWS,
      orderBy: { createdAt: "desc" },
      include: {
        assignee: { select: { name: true } },
      },
    });

    await audit({
      action: "leads.exported",
      actor: user,
      entityType: "Inquiry",
      meta: { rows: inquiries.length, truncated: inquiries.length >= MAX_ROWS },
    });

    const rows = inquiries.map((row) => [
      row.id,
      row.name,
      row.email,
      row.phone || "",
      row.topic || "",
      row.message,
      row.status,
      row.spamScore,
      row.source,
      row.createdAt.toISOString(),
      row.ipHash || "",
      row.userAgent || "",
      row.notes || "",
      row.assignee?.name || "",
    ]);

    const body = toCsv(HEADERS, rows);
    const stamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${stamp}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to export leads", error);
    return notFound();
  }
}
