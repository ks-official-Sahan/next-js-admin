// The public maintenance page (503), built from the saved maintenance setting:
// the operator's reason and, when set, the expected end time, which also
// drives Retry-After. Pure, so proxy.ts can call it and tests need no request.

export interface MaintenanceNotice {
  reason?: string;
  estimatedEndTime?: string;
}

const DEFAULT_REASON = "The site is temporarily unavailable. Please try again later.";
const RETRY_MIN_SECONDS = 60;
const RETRY_MAX_SECONDS = 24 * 60 * 60;
const RETRY_DEFAULT_SECONDS = 60 * 60;

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Seconds until the expected end (clamped to 1 min to 1 day), else one hour. */
export function retryAfterSeconds(notice: MaintenanceNotice | null, now: number): number {
  const end = notice?.estimatedEndTime ? Date.parse(notice.estimatedEndTime) : Number.NaN;
  if (!Number.isFinite(end)) return RETRY_DEFAULT_SECONDS;
  return Math.min(RETRY_MAX_SECONDS, Math.max(RETRY_MIN_SECONDS, Math.ceil((end - now) / 1000)));
}

export function maintenancePageHtml(notice: MaintenanceNotice | null, now: number): string {
  const reason = escapeHtml(notice?.reason?.trim().slice(0, 500) || DEFAULT_REASON);
  const end = notice?.estimatedEndTime ? Date.parse(notice.estimatedEndTime) : Number.NaN;
  const until =
    Number.isFinite(end) && end > now
      ? `<p>Expected back by <time datetime="${new Date(end).toISOString()}">${new Date(end).toUTCString()}</time>.</p>`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Maintenance</title>
  <style>body{font-family:sans-serif;text-align:center;padding:2rem}h1{font-size:2rem}p{color:#666}</style>
</head>
<body>
  <h1>Maintenance in Progress</h1>
  <p>${reason}</p>
  ${until}
</body>
</html>`;
}
