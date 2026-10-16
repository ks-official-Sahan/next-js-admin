// Small logger with redaction. Secrets never reach the logs: keys that look
// sensitive are replaced before anything is printed.

/**
 * Broad matcher for logs: over-redacting a log line costs little, so anything
 * that looks sensitive goes, except a few well-known keys (an HTTP status, a
 * cache key) that only looked sensitive and that debugging needs.
 */
export const SENSITIVE_KEY = /^(?!(?:statusCode|errorCode|cacheKey|sortKey|keywords)$).*(?:pass|token|secret|hash|code|otp|authorization|cookie|key)/i;

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
    // The clock through the timing API, not new Date(): a log line written
    // while Cache Components prerenders a page would otherwise fail the build.
    write(JSON.stringify({ ts: new Date(performance.timeOrigin + performance.now()).toISOString(), level, message, meta: safeMeta }));
  } else if (safeMeta === undefined) {
    write(`[${level}] ${message}`);
  } else {
    write(`[${level}] ${message}`, safeMeta);
  }
}

/**
 * Readable text for anything thrown. String() turns a plain object (a
 * WebSocket ErrorEvent from the database driver, say) into "[object Object]";
 * this keeps an Error's message, or the object's own JSON.
 */
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error !== "object" || error === null) return String(error);
  const message = (error as { message?: unknown }).message;
  if (typeof message === "string" && message) return message;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return Object.prototype.toString.call(error);
  }
}

export const log = {
  debug: (message: string, meta?: unknown) => emit("debug", message, meta),
  info: (message: string, meta?: unknown) => emit("info", message, meta),
  warn: (message: string, meta?: unknown) => emit("warn", message, meta),
  error: (message: string, meta?: unknown) => emit("error", message, meta),
};
