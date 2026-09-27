import "server-only";

import { randomBytes } from "node:crypto";

import { isBuildPhase } from "@/lib/db/state";
import { getEnv } from "@/lib/env";

export { authKit, DEFAULT_GRANTS, NEVER_GRANTABLE, PERMISSIONS, PERMISSION_ADDED_IN, PERMISSION_INFO, RBAC_SEED_VERSION, ROLES } from "./kit-config";
export type { Permission, PermissionGroup, PermissionInfo, RoleName } from "./kit-config";

// The one place AUTH_SECRET is fetched and null-checked (finding #16): every
// other app file that needs it imports AUTH_SECRET from here instead of
// re-reading and re-checking getEnv().AUTH_SECRET itself. Kept separate from
// kit-config.ts (which stays free of `server-only`/`@/lib/env`) so that
// proxy.ts — which cannot load `lib/env.ts`'s `server-only` guard, see
// AGENTS.md — can still import the config half without pulling this in.

// `next build` evaluates every route module to collect page data, with no
// secrets on a CI runner; nothing is signed or served then. Only in that
// phase a missing secret becomes a random per-process value, never a fixed
// string, so it can never verify anything outside that one build process.
// At runtime a missing secret still throws here, and assertProductionEnv()
// refuses to start production without one.
export const AUTH_SECRET: string = (() => {
  const secret = getEnv().AUTH_SECRET;
  if (secret) return secret;
  if (isBuildPhase()) return randomBytes(32).toString("base64url");
  throw new Error("AUTH_SECRET is not set");
})();

export const PRODUCTION = process.env.NODE_ENV === "production";
