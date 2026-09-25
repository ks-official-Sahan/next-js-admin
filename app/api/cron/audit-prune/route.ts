import { isValidCronSecret } from "@/lib/cron/auth";
import { DEFAULT_AUDIT_RETENTION_DAYS, housekeepingPruneJob } from "@/lib/cron/jobs";
import { log } from "@/lib/log";

// Cron route: prune old audit log rows past the retention period (default
// 365 days) and post revisions past the per-post cap. Triggered by Vercel
// Cron on the daily schedule in vercel.json.
// Requires Authorization: Bearer CRON_SECRET, checked in constant time.
// Idempotent, logs counts only, and the job itself writes an audit row for
// the prune. Design notes, Step 16.

export async function GET(request: Request) {
  if (!isValidCronSecret(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response(null, { status: 401 });
  }

  const retentionDays = Number.parseInt(process.env.AUDIT_RETENTION_DAYS ?? "", 10);
  const days = Number.isInteger(retentionDays) && retentionDays > 0 ? retentionDays : DEFAULT_AUDIT_RETENTION_DAYS;

  try {
    const result = await housekeepingPruneJob({ retentionDays: days });
    return Response.json({ deleted: result.deleted, auditRows: result.auditRows, revisions: result.revisions, retentionDays: days, timestamp: new Date().toISOString() });
  } catch (err) {
    log.error("cron audit-prune: unexpected error", { error: String(err) });
    return new Response(null, { status: 500 });
  }
}
