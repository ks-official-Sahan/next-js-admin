import "server-only";

import { auditSafe } from "@/lib/admin/audit";
import { limit } from "@/lib/cache/ratelimit";
import { repos } from "@/lib/data";

import type { AuthUser } from "./dal";
import { verifyPassword } from "./password";

/** Re-asks for the password before a sensitive change. Counts every try against the account. */
export async function confirmPassword(user: AuthUser, given: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof given !== "string" || given.length === 0 || given.length > 128) {
    return { ok: false, error: "Enter your current password." };
  }
  if (!(await limit("login:acct", `pw:${user.id}`)).ok) {
    return { ok: false, error: "Too many attempts. Wait a while and try again." };
  }
  const passwordHash = await repos.users.findPasswordHash(user.id);
  if (!passwordHash || !(await verifyPassword(given, passwordHash))) {
    await auditSafe({ action: "auth.password.check_failed", actor: user, entityType: "User", entityId: user.id });
    return { ok: false, error: "The current password is not correct." };
  }
  return { ok: true };
}
