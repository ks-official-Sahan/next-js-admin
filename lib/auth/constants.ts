import { SESSION_MAX_AGE_SECONDS } from "@sahan-sac/auth-kit/constants";

import { authKit } from "./kit-config";

// Resolved once, here, from the app's authKit config (lib/auth/kit-config.ts)
// so every reader (proxy.ts, the expire route, session-status route, the
// heartbeat, server actions) agrees on the same cookie names and paths. No
// `server-only` import: proxy.ts (Edge middleware) reads this file too.

const PRODUCTION = process.env.NODE_ENV === "production";

/** Auth.js session cookie. `__Host-`-prefixed in production; also the JWT salt, so getToken() uses the same name. */
export const SESSION_COOKIE = authKit.sessionCookieName(PRODUCTION);

export { SESSION_MAX_AGE_SECONDS };

export const LOGIN_PATH = authKit.paths.login;

/** Matches no route, so a rewrite to it renders the public 404 with a real 404 status. */
export const LOCKED_PATH = authKit.paths.locked;

/** Route Handler that clears the session cookie of a revoked browser. */
export const EXPIRE_PATH = authKit.paths.expire;

/** Where a user with `mustChangePassword` is sent until they choose their own password. */
export const ACCOUNT_PASSWORD_PATH = authKit.paths.accountPasswordChange;

/** Invite and reset links land here; the proxy lets a link with a valid tag through without the unlock cookie. */
export const SET_PASSWORD_PATH = authKit.paths.setPassword;

/** Self-service "forgot password" request form, shown to an unsigned-in visitor. */
export const FORGOT_PASSWORD_PATH = authKit.paths.forgotPassword;

/** Email-change confirmation links land here; same valid-tag bypass as SET_PASSWORD_PATH. */
export const CONFIRM_EMAIL_PATH = authKit.paths.confirmEmail;
