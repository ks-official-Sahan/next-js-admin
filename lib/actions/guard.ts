import "server-only";

import { getOptionalUser, hasPermission, type AuthUser } from "@/lib/auth/dal";
import type { Permission } from "@/lib/auth/permissions";

// Every Server Function calls this first. A Server Function is a public POST
// endpoint, so it never trusts that the page it came from was allowed to render
// (design notes, section 6.1, [N13]).

export type Authorized = { ok: true; user: AuthUser } | { ok: false; error: string };

export async function authorizeAction(
  permission: Permission | null,
  options: { allowPasswordChange?: boolean } = {}
): Promise<Authorized> {
  const user = await getOptionalUser();
  if (!user) return { ok: false, error: "You are signed out. Sign in again." };
  if (user.mustChangePassword && !options.allowPasswordChange) {
    return { ok: false, error: "Choose your own password on the account page first." };
  }
  if (permission && !hasPermission(user, permission)) {
    return { ok: false, error: "You do not have permission to do that." };
  }
  return { ok: true, user };
}
