import { UniqueViolation } from "../errors";

// Drizzle wraps driver errors (DrizzleQueryError) and keeps the Postgres one
// as `cause`; the SQLSTATE code is on whichever carries it.
function pgCode(error: unknown): string | undefined {
  const own = (error as { code?: unknown } | null)?.code;
  if (typeof own === "string") return own;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof cause === "string" ? cause : undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return pgCode(error) === "23505";
}

/**
 * True when the database was too slow or unreachable to finish (connection
 * failure, statement timeout, server shutdown, too many connections), as
 * opposed to a bad request. The change was rolled back, so the caller can retry.
 */
export function isDbUnavailable(error: unknown): boolean {
  const code = pgCode(error) ?? "";
  if (code.startsWith("08") || code === "57014" || code.startsWith("57P") || code === "53300") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  const message = error instanceof Error ? `${error.message} ${cause instanceof Error ? cause.message : ""}` : "";
  return /timed? ?out|ECONNREFUSED|ECONNRESET|ETIMEDOUT|Connection terminated/i.test(message);
}

/** Runs a write, turning Postgres's unique-constraint failure into UniqueViolation. */
export async function translateUnique<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new UniqueViolation();
    throw error;
  }
}
