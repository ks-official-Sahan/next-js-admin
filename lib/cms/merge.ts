import type { z } from "zod";

// Turns stored content into what a page renders: the code defaults with the stored
// value laid over them, validated. Pure, so the rules are unit tested
// (design notes, section 5.2).
//
// - Objects merge key by key and the stored value wins.
// - Arrays are replaced whole, never merged by index.
// - A block that fails validation is ignored and the defaults are used.

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Keys that would change an object's prototype are never copied. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  if (isPlainObject(base) && isPlainObject(over)) {
    const out: Record<string, unknown> = { ...base };
    for (const key of Object.keys(over)) {
      if (UNSAFE_KEYS.has(key)) continue;
      out[key] = deepMerge(base[key], over[key]);
    }
    return out;
  }
  return over;
}

export interface ResolveResult<T> {
  data: T;
  /** True when a stored block was used. */
  fromStore: boolean;
  /** Why a stored block was ignored, when it was. */
  ignored?: string;
}

/**
 * `defaults` is trusted code. `stored` is whatever the database holds and is
 * never trusted: it must pass `schema` after merging.
 */
export function resolveSection<T>(
  schema: z.ZodType<T>,
  defaults: T,
  stored: unknown,
  onIgnored?: (reason: string) => void
): ResolveResult<T> {
  if (stored === undefined || stored === null) return { data: defaults, fromStore: false };

  const parsed = schema.safeParse(deepMerge(defaults, stored));
  if (parsed.success) return { data: parsed.data, fromStore: true };

  const first = parsed.error.issues[0];
  const reason = `${first?.path.join(".") || "(root)"}: ${first?.message ?? "invalid"}`;
  onIgnored?.(reason);
  return { data: defaults, fromStore: false, ignored: reason };
}
