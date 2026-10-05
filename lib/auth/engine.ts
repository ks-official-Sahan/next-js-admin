import "server-only";

import { AuthError } from "next-auth";

import { auth, signIn, signOut, unstable_update } from "./config";
import { AUTH_SECRET } from "./kit";
import { passwordFingerprint } from "./session-state";

// The one place server code meets the auth engine (next-auth here). Server
// actions, the data access layer and routes call these and never the engine
// itself, so the Better Auth variant (create-admin --auth better-auth) swaps
// this file, config.ts and session-cookie.ts and nothing else.

/** Reads the request's session for the data access layer. */
export const sessionSource = auth;

/** next-auth sessions are JWTs, so the DAL also compares their password fingerprint (`pwf`). */
export const CHECK_PASSWORD_FINGERPRINT = true;

function codeOf(error: unknown): string | null {
  if (error instanceof AuthError) {
    const code = (error as AuthError & { code?: string }).code;
    return typeof code === "string" ? code : "invalid";
  }
  return null;
}

/**
 * Signs in with `{ email, password }`, or `{ challengeId }` once the emailed
 * code is verified. Null on success (the session cookie is set), else the
 * refusal code: "invalid", "limited" or "mfa_required".
 */
export async function attemptSignIn(credentials: Record<string, string>): Promise<{ code: string } | null> {
  try {
    // `signIn` reports a refusal by throwing or, depending on the version, by returning a URL.
    const result = await signIn("credentials", { ...credentials, redirect: false });
    if (typeof result === "string" && result.includes("error=")) {
      return { code: new URL(result, "http://local").searchParams.get("code") ?? "invalid" };
    }
    return null;
  } catch (error) {
    const code = codeOf(error);
    if (code === null) throw error;
    return { code };
  }
}

/** Clears the session cookie and redirects. Revoke the session row first. */
export async function signOutAndRedirect(to: string): Promise<never> {
  await signOut({ redirectTo: to });
  throw new Error("unreachable: signOut redirects");
}

/** Keeps the current session valid after its own password change: its JWT gets the new fingerprint. */
export async function keepSessionAfterPasswordChange(passwordHash: string): Promise<void> {
  await unstable_update({ pwf: passwordFingerprint(passwordHash, AUTH_SECRET) });
}
