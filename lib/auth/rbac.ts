import "server-only";

import { createRbac } from "@sahan-sac/auth-kit/rbac";

import { audit } from "@/lib/admin/audit";
import { kv } from "@/lib/cache/redis";

import { authKit } from "./kit-config";
import { prismaAuthAdapter } from "./prisma-adapter";

// The role by permission matrix, from Postgres with a 60 second Redis copy.

export const { loadMatrix, invalidateMatrix, getRolePermissions, roleCan, replaceMatrix } = createRbac({
  adapter: prismaAuthAdapter,
  kv,
  kit: authKit,
  writeAudit: (event, tx) => audit(event, tx as Parameters<typeof audit>[1]),
});
