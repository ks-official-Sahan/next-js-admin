import { UniqueViolation } from "../errors";

/** Prisma's unique-constraint failure. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

/** Prisma's "record to update or delete not found". */
export function isNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2025";
}

/**
 * True when the database was too slow or unreachable to finish (a connection
 * or pool timeout, or an interactive transaction that expired), as opposed to
 * a bad request. The change was rolled back, so the caller can retry.
 */
export function isDbUnavailable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P1001" || code === "P1002" || code === "P1008" || code === "P1017" || code === "P2024" || code === "P2028") return true;
  const message = error instanceof Error ? error.message : "";
  return /expired transaction|Transaction API error|Can't reach database|timed out/i.test(message);
}

/** Runs a write, turning Prisma's unique-constraint failure into UniqueViolation. */
export async function translateUnique<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw new UniqueViolation();
    throw error;
  }
}
