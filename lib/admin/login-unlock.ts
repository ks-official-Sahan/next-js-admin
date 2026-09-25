export * from "@sahan-sac/auth-kit/login-unlock";

import { authKit } from "@/lib/auth/kit-config";

const PRODUCTION = process.env.NODE_ENV === "production";

/** Hidden-login unlock cookie. `__Host-`-prefixed in production. */
export const UNLOCK_COOKIE = authKit.unlockCookieName(PRODUCTION);
