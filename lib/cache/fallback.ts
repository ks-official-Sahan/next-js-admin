import { dbConfigured, isBuildPhase } from "../db/state";

export interface LoadContext {
  /** Overrides dbConfigured(), for tests. */
  configured?: boolean;
  /** Overrides isBuildPhase(), for tests. */
  buildPhase?: boolean;
  /** Called with the error when a build-time read fails and defaults are used. */
  onError?: (error: unknown) => void;
}

/**
 * The loader failure rule (design notes, D4).
 *
 * Returns null when the caller should use its code defaults:
 * - the database is not configured, or
 * - the read failed while `next build` runs.
 *
 * Any other failure is rethrown, so a stale ISR page keeps being served instead
 * of a wrong default. A read that legitimately finds nothing also returns
 * null, and the caller treats that the same way.
 *
 * Call this OUTSIDE cached(), so a fallback is never written into the data
 * cache.
 */
export async function loadOrNull<T>(
  read: () => Promise<T>,
  context: LoadContext = {}
): Promise<T | null> {
  if (!(context.configured ?? dbConfigured())) return null;

  try {
    return await read();
  } catch (error) {
    if (context.buildPhase ?? isBuildPhase()) {
      context.onError?.(error);
      return null;
    }
    throw error;
  }
}
