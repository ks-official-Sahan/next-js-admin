import "server-only";

import { createRbac } from "@sahan-sac/auth-kit/rbac";

import { audit } from "@/lib/admin/audit";
import { kv } from "@/lib/cache/redis";

import { authKit } from "./kit-config";
import { authAdapter } from "@/lib/data";

// The role by permission matrix, from Postgres with a 60 second Redis copy.

export const { loadMatrix, invalidateMatrix, getRolePermissions, roleCan, replaceMatrix } = createRbac({
  adapter: authAdapter,
  kv,
  kit: authKit,
  writeAudit: (event, tx) => audit(event, tx as Parameters<typeof audit>[1]),
});
