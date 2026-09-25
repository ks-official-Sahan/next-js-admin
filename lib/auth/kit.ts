import "server-only";

import { getEnv } from "@/lib/env";

export { authKit, DEFAULT_GRANTS, NEVER_GRANTABLE, PERMISSIONS, PERMISSION_ADDED_IN, PERMISSION_INFO, RBAC_SEED_VERSION, ROLES } from "./kit-config";
export type { Permission, PermissionGroup, PermissionInfo, RoleName } from "./kit-config";

// The one place AUTH_SECRET is fetched and null-checked (finding #16): every
// other app file that needs it imports AUTH_SECRET from here instead of
// re-reading and re-checking getEnv().AUTH_SECRET itself. Kept separate from
// kit-config.ts (which stays free of `server-only`/`@/lib/env`) so that
// proxy.ts — which cannot load `lib/env.ts`'s `server-only` guard, see
// AGENTS.md — can still import the config half without pulling this in.

export const AUTH_SECRET: string = (() => {
  const secret = getEnv().AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
})();

export const PRODUCTION = process.env.NODE_ENV === "production";
