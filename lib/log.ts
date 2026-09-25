// Small logger with redaction. Secrets never reach the logs: keys that look
// sensitive are replaced before anything is printed.

/** Broad matcher for logs: over-redacting a log line costs nothing. */
export const SENSITIVE_KEY = /pass|token|secret|hash|code|otp|authorization|cookie|key/i;

/**
 * Narrow matcher for audit before/after snapshots, where a field such as
 * `keywords` or `sortKey` is real data and must stay readable.
 */
export const AUDIT_SENSITIVE_KEY =
  /^(password|passwordhash|newpassword|currentpassword|token|tokenhash|secret|code|codehash|otp|authorization|cookie|apikey|api_key|accesstoken|refreshtoken)$/i;

export const REDACTED = "[redacted]";

const MAX_DEPTH = 8;

export function redact(value: unknown, matcher: RegExp = SENSITIVE_KEY, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[truncated]";
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, matcher, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = matcher.test(key) ? REDACTED : redact(item, matcher, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, message: string, meta?: unknown): void {
  const production = process.env.NODE_ENV === "production";
  if (level === "debug" && production) return;

  const safeMeta = meta === undefined ? undefined : redact(meta);
  const write = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (production) {
    write(JSON.stringify({ ts: new Date().toISOString(), level, message, meta: safeMeta }));
  } else if (safeMeta === undefined) {
    write(`[${level}] ${message}`);
  } else {
    write(`[${level}] ${message}`, safeMeta);
  }
}

export const log = {
  debug: (message: string, meta?: unknown) => emit("debug", message, meta),
  info: (message: string, meta?: unknown) => emit("info", message, meta),
  warn: (message: string, meta?: unknown) => emit("warn", message, meta),
  error: (message: string, meta?: unknown) => emit("error", message, meta),
};
