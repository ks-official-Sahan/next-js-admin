// Dates for admin tables. Fixed to UTC so the server render and the browser agree
// and a screenshot means the same thing wherever it was taken.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (value: number) => String(value).padStart(2, "0");

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "Never";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", else the date. */
export function relativeTime(value: Date | null | undefined, now: number = Date.now()): string {
  if (!value) return "Never";
  const seconds = Math.round((now - value.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const unit = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"} ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return unit(hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 14) return unit(days, "day");
  return formatDateTime(value);
}
