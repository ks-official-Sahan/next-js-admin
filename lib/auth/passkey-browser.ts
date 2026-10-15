// What the browser can do with passkeys, and what a failed passkey prompt
// means, in words a person can act on. Pure (the caller reads `window`), so
// both are unit tested; the sign-in form and the account page share them.
//
// The relying party id is fixed to the site's apex (lib/auth/passkeys.ts).
// A passkey only works on that host or a subdomain of it, so a preview or
// LAN address can never use one: the option is hidden there rather than
// failing the moment it is pressed.

export type PasskeySupport = "ready" | "unsupported" | "insecure" | "other-address";

export interface BrowserFacts {
  /** `window.isSecureContext` (https, or localhost). */
  secure: boolean;
  /** `browserSupportsWebAuthn()` from @simplewebauthn/browser. */
  webauthn: boolean;
  /** `window.location.hostname`. */
  hostname: string;
}

export function passkeySupportFor(facts: BrowserFacts, rpId: string): PasskeySupport {
  if (!facts.secure) return "insecure";
  if (!facts.webauthn) return "unsupported";
  const host = facts.hostname.toLowerCase();
  const rp = rpId.toLowerCase();
  return host === rp || host.endsWith(`.${rp}`) ? "ready" : "other-address";
}

/** Why the passkey option is not offered, for the method list. */
export function unsupportedReason(support: PasskeySupport, rpId: string): string | null {
  switch (support) {
    case "ready":
      return null;
    case "insecure":
      return "Passkeys need a secure (https) connection.";
    case "unsupported":
      return "This browser does not support passkeys.";
    case "other-address":
      return `Passkeys for this account only work at ${rpId}.`;
  }
}

type Ceremony = "sign-in" | "add";

/**
 * A message for an error thrown by startAuthentication/startRegistration.
 * @simplewebauthn/browser wraps DOMExceptions in a WebAuthnError with a
 * `code`; anything else is read by its DOMException `name`.
 */
export function passkeyErrorMessage(error: unknown, rpId: string, ceremony: Ceremony): string {
  const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
  switch (code) {
    case "ERROR_CEREMONY_ABORTED":
      return "The passkey request was cancelled. Try again.";
    case "ERROR_INVALID_DOMAIN":
    case "ERROR_INVALID_RP_ID":
      return `Passkeys for this account only work at ${rpId}. Open the admin there, or use another method.`;
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
      return "This device already has a passkey for your account. Use it to sign in, or remove it here first.";
    case "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT":
      return "This security key cannot store a passkey. Use your phone or computer's passkey instead.";
    case "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT":
      return "This authenticator cannot check it is you (no PIN, fingerprint or face). Use another one.";
    case "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG":
      return "This authenticator does not support the required signature type. Use another one.";
  }
  switch (name) {
    case "NotAllowedError":
      return ceremony === "sign-in"
        ? "No passkey was used. The prompt was closed or timed out, or this device has no passkey for your account. Try again or use another method."
        : "No passkey was saved. The prompt was closed or timed out. Try again.";
    case "SecurityError":
      return `Passkeys for this account only work at ${rpId}. Open the admin there, or use another method.`;
    case "InvalidStateError":
      return "This device already has a passkey for your account. Use it to sign in, or remove it here first.";
    case "NotSupportedError":
      return "This browser or device does not support this kind of passkey. Use another method.";
    case "AbortError":
      return "The passkey request was cancelled. Try again.";
  }
  return ceremony === "sign-in"
    ? "The passkey could not be used. Try again or use another method."
    : "The passkey could not be added. Try again.";
}

/** Server challenges live MFA_TTL_MINUTES (5); options older than this are fetched again. */
export const PREPARED_OPTIONS_MAX_AGE_MS = 4 * 60_000;

/** Each configured domain as a relying party id (apex, no www, no port), primary first. */
export function relyingParties(origins: readonly string[]): string[] {
  const ids = origins.flatMap((value) => {
    try {
      const url = new URL(value);
      // Only https counts: WebAuthn needs a secure context.
      return url.protocol === "https:" ? [url.hostname.toLowerCase().replace(/^www\./, "")] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(ids)];
}

/** The relying party for a request's host: its own configured domain, or null. */
export function relyingPartyForHost(host: string | null | undefined, ids: readonly string[]): string | null {
  const name = host?.trim().toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  return name && ids.includes(name) ? name : null;
}
