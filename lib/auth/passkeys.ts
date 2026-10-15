import "server-only";

import { headers } from "next/headers";

import { createPasskeys } from "@sahan-sac/auth-kit/webauthn";

import { SiteMetadata } from "@/config/site";
import { audit, auditSafe } from "@/lib/admin/audit";
import { kv } from "@/lib/cache/redis";
import { authAdapter, reposFor } from "@/lib/data";
import { getSetting } from "@/lib/settings/service";
import { siteOrigins } from "@/lib/site-url";

import { AUTH_SECRET } from "./kit";
import { authKit } from "./kit-config";
import { mfa } from "./mfa";
import { relyingParties, relyingPartyForHost } from "./passkey-browser";

// Passkeys (WebAuthn) for the second sign-in step and, when the
// security.passkeySignIn setting is on, for signing in with a passkey alone.
//
// Every configured site domain is a relying party (SITE_URLS, else SITE_URL
// and the built-in defaults: lib/site-url.ts), so the admin keeps its
// passkeys on a backup domain while the primary one is down. WebAuthn ties a
// passkey to the domain it was made on, so each domain has its own: add one
// on each address you sign in from. A ceremony runs for the domain of the
// request, and only when that domain is configured; any other host (a Vercel
// preview, a spoofed Host header) gets the primary, which its browser then
// refuses. A development build runs on localhost, which browsers accept as a
// secure context, so passkeys work there too.

const production = process.env.NODE_ENV === "production";

const configured = production ? relyingParties(siteOrigins()) : [];
/** Every relying party id, primary first. */
export const PASSKEY_RP_IDS: readonly string[] = configured.length > 0 ? configured : ["localhost"];
/** The primary relying party id. */
export const PASSKEY_RP_ID = PASSKEY_RP_IDS[0];

/** The relying party for the current request: the configured domain it came to, else the primary. */
export async function requestRelyingParty(): Promise<string> {
  return relyingPartyForHost((await headers()).get("host"), PASSKEY_RP_IDS) ?? PASSKEY_RP_ID;
}

export const passkeys = createPasskeys({
  adapter: authAdapter,
  mfa,
  authSecret: AUTH_SECRET,
  audit: (event, tx) => (tx ? audit(event, reposFor(tx)) : auditSafe(event)),
  rpName: SiteMetadata.title,
  rpID: PASSKEY_RP_IDS,
  origin: production ? PASSKEY_RP_IDS.flatMap((id) => [`https://${id}`, `https://www.${id}`]) : ["http://localhost:3000", "http://localhost:3001"],
  // Passwordless challenges: one Redis key each, taken once (DEL count).
  challengeStore: {
    put: async (key, ttlSeconds) => void (await kv.set(`${authKit.keyPrefix}${key}`, 1, { ttlSeconds })),
    take: async (key) => (await kv.del(`${authKit.keyPrefix}${key}`)) === 1,
  },
});

/** Whether a passkey alone may sign in (Settings, DEVELOPER only). */
export async function passkeySignInEnabled(): Promise<boolean> {
  return (await getSetting("security.passkeySignIn")).enabled;
}
