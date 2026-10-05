import "server-only";

import { betterAuthSessionSource, signInRefusal } from "@sahan-sac/auth-kit/better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "./config";

// The one place server code meets the auth engine (Better Auth here). Server
// actions, the data access layer and routes call these and never the engine
// itself; the next-auth version of this file has the same exports.

const requestHeaders = async () => new Headers(await headers());

/** Reads the request's session for the data access layer. */
export const sessionSource = betterAuthSessionSource(auth, requestHeaders);

/**
 * Better Auth sessions are database rows with no password fingerprint claim.
 * A password change ends the user's other sessions by revoking their rows,
 * which every password action here already does.
 */
export const CHECK_PASSWORD_FINGERPRINT = false;

type SignInBody = { email: string; password: string } | { challengeId: string };

/**
 * Signs in with `{ email, password }`, or `{ challengeId }` once the emailed
 * code is verified. Null on success (the session cookie is set), else the
 * refusal code: "invalid", "limited" or "mfa_required".
 */
export async function attemptSignIn(credentials: Record<string, string>): Promise<{ code: string } | null> {
  try {
    await auth.api.authKitSignIn({ body: credentials as SignInBody, headers: await requestHeaders() });
    return null;
  } catch (error) {
    const code = signInRefusal(error);
    if (code === null) throw error;
    return { code };
  }
}

/** Clears the session cookies and redirects. Revoke the session row first. */
export async function signOutAndRedirect(to: string): Promise<never> {
  await auth.api.authKitClearSession({ headers: await requestHeaders() });
  redirect(to);
}

/** Nothing to refresh: the session is its row, which a password change leaves valid. */
export async function keepSessionAfterPasswordChange(_passwordHash: string): Promise<void> {}
