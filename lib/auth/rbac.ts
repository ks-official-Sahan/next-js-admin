import "server-only";

import { createReactRbac } from "@sahan-sac/auth-kit/rbac/react";

import { audit } from "@/lib/admin/audit";
import { kv } from "@/lib/cache/redis";

import { authKit } from "./kit-config";
import { getRoleCatalog } from "./roles";
import { authAdapter, reposFor } from "@/lib/data";

// The role by permission matrix, from Postgres with a 60 second Redis copy,
// covering every role in the roles table (lib/auth/roles.ts).

export const { loadMatrix, invalidateMatrix, getRolePermissions, roleCan, replaceMatrix } = createReactRbac({
  adapter: authAdapter,
  kv,
  kit: authKit,
  writeAudit: (event, tx) => audit(event, reposFor(tx)),
  loadRoles: async () => (await getRoleCatalog()).names,
});
