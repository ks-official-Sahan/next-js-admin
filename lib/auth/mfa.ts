import "server-only";

import { createMfa, mfaMethodsFor, type MfaMethods } from "@sahan-sac/auth-kit/mfa";

import { audit, auditSafe } from "@/lib/admin/audit";
import { limit } from "@/lib/cache/ratelimit";
import { kv } from "@/lib/cache/redis";
import { sendEmail } from "@/lib/email";
import { mfaCode } from "@/lib/email/templates";

import { AUTH_SECRET } from "./kit";
import { authKit } from "./kit-config";
import { authAdapter, reposFor } from "@/lib/data";

// The second sign-in step and the factors behind it: emailed codes, an
// authenticator app (TOTP), recovery codes, and passkeys (./passkeys.ts).
// One instance, shared by the sign-in deps, the sign-in actions and the
// account page.

// auth-kit's deps are typed with the loose shape any app could have, but the
// app's own `limit` and `sendEmail` are typed against its specific bucket
// names and email categories, so they are not structurally assignable as
// bare references.
const limitAdapter = (bucket: string, key: string) => limit(bucket as Parameters<typeof limit>[0], key);
const sendEmailAdapter = (
  message: { to: string; subject: string; html: string; text: string; category: string },
  context: { actor: { id: string; email: string } }
) => sendEmail(message as Parameters<typeof sendEmail>[0], context);

export const mfa = createMfa({
  adapter: authAdapter,
  authSecret: AUTH_SECRET,
  limit: limitAdapter,
  sendEmail: sendEmailAdapter,
  audit: (event, tx) => (tx ? audit(event, reposFor(tx)) : auditSafe(event)),
  // Passkey challenges are never emailed; only the code purposes reach the template.
  renderMfaCode: (input) => mfaCode({ ...input, purpose: input.purpose === "PASSKEY_REGISTER" || input.purpose === "PASSKEY_SIGN_IN" ? undefined : input.purpose }),
  // One authenticator-app code works once, across every instance (Redis SET NX).
  claimOnce: (key, ttlSeconds) => kv.set(`${authKit.keyPrefix}${key}`, 1, { ttlSeconds, nx: true }),
  setupLimit: (userId) => limit("mfa:setup:user", userId),
});

export const {
  issueChallenge,
  openTicket,
  openVerifiedTicket,
  verifyChallenge,
  verifyTotp,
  verifyRecoveryCode,
  consumeChallenge,
  challengeOwner,
  factorsOf,
  issueRecoveryCodes,
  beginTotpSetup,
  confirmTotpSetup,
  removeTotp,
  removeFactors,
} = mfa;

/** The second-step methods this user may use, or null when the user is gone. */
export async function signInMethods(userId: string): Promise<MfaMethods | null> {
  const factors = await factorsOf(userId);
  return factors ? mfaMethodsFor(factors) : null;
}

export type { IssueResult, MfaMethods, MfaPurpose, VerifyResult } from "@sahan-sac/auth-kit/mfa";
