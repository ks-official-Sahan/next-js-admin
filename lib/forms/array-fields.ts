// Pure helpers for carrying array and object fields through a plain <form>.
// FormData collapses repeated/same-named entries (checkbox groups, repeatable
// rows) to a single value via Object.fromEntries(formData.entries()), so
// every admin works form serializes its array/object fields (tech, links,
// platforms, image, highlights) into one hidden input holding JSON text.
// These functions are the single place that encodes/decodes that text, used
// both by the client field components (encoding on every change) and by
// lib/actions/works.ts (decoding before zod validation).

/** Parses a JSON array from a form field. Returns `fallback` for anything empty, malformed, or not an array. */
export function parseJsonArray<T = unknown>(raw: FormDataEntryValue | null | undefined, fallback: T[] = []): T[] {
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

/** Parses a JSON object (not array, not null) from a form field. Returns `null` for anything else. */
export function parseJsonObject<T = unknown>(raw: FormDataEntryValue | null | undefined): T | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** Serializes a value for a hidden JSON field. */
export function toJsonField(value: unknown): string {
  return JSON.stringify(value);
}

export type DecodeResult = { ok: true } | { ok: false; error: string };

/**
 * Mutates `payload` in place, JSON-decoding each listed key when present as a
 * non-empty string (a Server Action's `Object.fromEntries(formData.entries())`
 * output, before zod validation). Leaves absent or empty keys untouched, so an
 * optional array field can simply be omitted from the form.
 */
export function decodeJsonFields(payload: Record<string, unknown>, keys: readonly string[]): DecodeResult {
  for (const key of keys) {
    const raw = payload[key];
    if (typeof raw === "string" && raw.trim() !== "") {
      try {
        payload[key] = JSON.parse(raw);
      } catch {
        return { ok: false, error: `Invalid JSON in ${key}.` };
      }
    }
  }
  return { ok: true };
}
