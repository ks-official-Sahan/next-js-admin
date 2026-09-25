import { timingSafeEqual } from "node:crypto";

// Cron route authorization: Vercel Cron sends `Authorization: Bearer
// <CRON_SECRET>`. Compared in constant time so a timing attack cannot recover
// the secret one byte at a time. No "server-only" import: this is pure and
// unit tested without a request. Design notes, Step 16.

/**
 * True only when `authorizationHeader` is exactly `Bearer <secret>` for the
 * configured CRON_SECRET. An unset secret never authorizes (a route handler
 * cannot be accidentally left open by a missing environment variable).
 */
export function isValidCronSecret(
  authorizationHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorizationHeader ?? "");

  // timingSafeEqual throws on a length mismatch, and the length itself must be
  // checked without leaking timing, so compare it up front: two fixed-size
  // reads, no data-dependent branch cost worth the name.
  if (given.length !== expected.length) return false;

  return timingSafeEqual(given, expected);
}
