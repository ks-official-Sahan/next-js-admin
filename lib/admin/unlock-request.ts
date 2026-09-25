import "server-only";

import { unlockKeysFromEnv } from "@sahan-sac/auth-kit/login-unlock";
import { hasValidUnlock as packageHasValidUnlock } from "@sahan-sac/auth-kit/unlock-request";

import { UNLOCK_COOKIE } from "@/lib/admin/login-unlock";

/**
 * Does this request carry a valid unlock cookie? Kept as a zero-argument
 * wrapper (the package's own `hasValidUnlock` now takes `keys`/`cookieName`
 * as parameters instead of reading them itself) so every existing call site
 * keeps working unchanged.
 */
export async function hasValidUnlock(): Promise<boolean> {
  return packageHasValidUnlock(unlockKeysFromEnv(), UNLOCK_COOKIE);
}
