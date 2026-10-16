import { NOT_CONFIGURED, runBackup } from "@/lib/backup/run";
import { isValidCronSecret } from "@/lib/cron/auth";

// Cron route: a full, encrypted backup of the site's schema to the backup
// bucket, then retention pruning (lib/backup). Triggered daily by Vercel Cron
// (vercel.json). Requires Authorization: Bearer CRON_SECRET, checked in
// constant time. Answers 200 with the run's counts, 500 when it failed (the
// reason goes to the server log, not the response), and 200 "skipped" when
// backups are not configured, so a deployment without them shows no failure.

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isValidCronSecret(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response(null, { status: 401 });
  }
  const status = await runBackup("cron", { timeoutMs: 50_000 });
  if (!status.ok && status.error?.startsWith(NOT_CONFIGURED)) return Response.json({ skipped: true, reason: "not configured" });
  const { error: _error, ...counts } = status;
  return Response.json(counts, { status: status.ok ? 200 : 500 });
}
