import "server-only";

import { cache } from "react";

import { createMask, type Mask } from "@sahan-sac/auth-kit/rbac/mask";

import { repos } from "@/lib/data";
import { getEnv } from "@/lib/env";
import type { PresentRoles } from "@/lib/data/users";
import { getSetting } from "@/lib/settings/service";

import { MASK_ROLE, SUPER_ROLE, type RoleName } from "./permissions";
import { getRoleCatalog } from "./roles";

// Developer masking: a DEVELOPER shown to everyone else as a SUPER_ADMIN,
// every developer at once (setting "security.mask") or one by one
// (users.masked). Presentation only: permissions, canManage and the
// last-developer rule keep the real role. Pages run what they send through
// this on the server, so a real role never reaches a viewer it is masked
// from. Only developers see the toggles and who is masked.
//
// The whole feature is off unless ADMIN_PRESENTATION_MODE is exactly "true":
// then every role shows as it is, the toggles and their actions do not exist,
// and developer audit rows are readable like any other. Stored flags
// (users.masked, "security.mask") are kept and apply again once it is on.

export interface DeveloperMask extends Mask<RoleName> {
  global: boolean;
  /** Developers masked right now, globally or one by one. */
  maskedCount: number;
  unmaskedCount: number;
  /** For the user search: undefined when the viewer sees real roles. */
  presentFor(viewer: { role: RoleName }): PresentRoles | undefined;
}

/** Whether developer masking exists at all (ADMIN_PRESENTATION_MODE=true). */
export function maskingEnabled(): boolean {
  return getEnv().ADMIN_PRESENTATION_MODE;
}

/** The mask while the feature is off: real roles for everyone, no database reads. */
function maskOff(): DeveloperMask {
  const mask = createMask<RoleName>({ superRole: SUPER_ROLE, maskAs: MASK_ROLE }, { global: false, users: new Set() });
  return {
    ...mask,
    visibleRoles: (_viewer, roles) => [...roles],
    presentCounts: (_viewer, counts) => ({ ...counts }),
    canSeeAuditBy: () => true,
    global: false,
    maskedCount: 0,
    unmaskedCount: 0,
    presentFor: () => undefined,
  };
}

/** Loaded once per request: the setting (cached) and the few developer rows. */
export const getDeveloperMask = cache(async (): Promise<DeveloperMask> => {
  if (!maskingEnabled()) return maskOff();
  const [setting, developers, catalog] = await Promise.all([getSetting("security.mask"), repos.users.maskFlags(SUPER_ROLE), getRoleCatalog()]);
  const users = new Set(developers.filter((developer) => developer.masked).map((developer) => developer.id));
  const mask = createMask<RoleName>({ superRole: SUPER_ROLE, maskAs: MASK_ROLE }, { global: setting.global, users });
  const maskedCount = setting.global ? developers.length : users.size;
  return {
    ...mask,
    global: setting.global,
    maskedCount,
    unmaskedCount: developers.length - maskedCount,
    presentFor: (viewer) =>
      mask.seesThrough(viewer) || maskedCount === 0
        ? undefined
        : { superRole: SUPER_ROLE, maskAs: MASK_ROLE, global: setting.global, roles: catalog.names },
  };
});
