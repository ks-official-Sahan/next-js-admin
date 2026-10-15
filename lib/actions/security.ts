"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

import { SiteMetadata } from "@/config/site";
import { auditSafe } from "@/lib/admin/audit";
import { authorizeAction } from "@/lib/actions/guard";
import { confirmPassword } from "@/lib/auth/confirm-password";
import type { AuthUser } from "@/lib/auth/dal";
import { beginTotpSetup, confirmTotpSetup, factorsOf, issueRecoveryCodes, removeTotp } from "@/lib/auth/mfa";
import { passkeys, requestRelyingParty } from "@/lib/auth/passkeys";
import { invalidateUserSessionState, revokeUserSessions } from "@/lib/auth/session-store";
import { repos } from "@/lib/data";
import { hasStrongFactor, otpauthUri } from "@sahan-sac/auth-kit/mfa";
import type { RegistrationResponseJSON } from "@sahan-sac/auth-kit/webauthn";

// The signed-in user's strong factors: an authenticator app, passkeys and
// recovery codes. Open to a user whose role must set one up before anything
// else (allowMfaSetup). Removing a factor or making new recovery codes asks
// for the password again.

const ACCOUNT_PATH = "/admin/account";
const OPTIONS = { allowMfaSetup: true } as const;
const UNEXPECTED = "Something went wrong. Nothing was changed.";

export interface SecurityState {
  ok: boolean;
  error: string | null;
  message: string | null;
  /** The authenticator-app secret, base32, while setting it up. */
  secret?: string;
  /** The same secret as an otpauth QR code (SVG markup made on the server). */
  qr?: string;
  /** New recovery codes, shown once. */
  recoveryCodes?: string[];
}

const failed = (error: string): SecurityState => ({ ok: false, error, message: null });
const succeeded = (message: string, extra: Partial<SecurityState> = {}): SecurityState => ({ ok: true, error: null, message, ...extra });

/**
 * After the first strong factor: sessions opened before it never passed it,
 * so they end; this one, which just proved the factor, is marked verified;
 * and the cached session state is dropped so the admin opens at once.
 */
async function afterStrongFactorAdded(user: AuthUser, wasStrong: boolean): Promise<void> {
  if (!wasStrong) {
    const ended = await revokeUserSessions(user.id, { userId: user.id, reason: "mfa_enabled" }, { exceptSid: user.sid });
    await repos.sessions.markMfaVerified(user.sid);
    if (ended.length > 0) {
      await auditSafe({ action: "auth.session.revoked", actor: user, entityType: "User", entityId: user.id, meta: { sessions: ended.length, reason: "mfa_enabled" } });
    }
  }
  await invalidateUserSessionState(user.id);
}

async function strongNow(userId: string): Promise<boolean> {
  const factors = await factorsOf(userId);
  return Boolean(factors && hasStrongFactor(factors));
}

export async function beginTotpSetupAction(_previous: SecurityState, _formData: FormData): Promise<SecurityState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return failed(access.error);
  const { user } = access;
  try {
    const started = await beginTotpSetup(user);
    if (!started.ok) return failed("An authenticator app is already set up. Remove it first to set up another.");
    const uri = otpauthUri({ issuer: SiteMetadata.title, account: user.email, secret: started.secret });
    const qr = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return succeeded("Scan the code with your authenticator app, then enter the 6 digit code it shows.", { secret: started.secret, qr });
  } catch {
    return failed(UNEXPECTED);
  }
}

export async function confirmTotpSetupAction(_previous: SecurityState, formData: FormData): Promise<SecurityState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return failed(access.error);
  const { user } = access;
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return failed("Enter the 6 digit code from your app.");
  try {
    const wasStrong = await strongNow(user.id);
    const result = await confirmTotpSetup(user, code);
    if (!result.ok) {
      return failed(
        result.reason === "limited"
          ? "Too many wrong codes. Wait a few minutes and try again."
          : result.reason === "not_started"
            ? "Start the setup again."
            : "That code is not correct. Check the time on your phone and try the newest code."
      );
    }
    await afterStrongFactorAdded(user, wasStrong);
    revalidatePath(ACCOUNT_PATH);
    return succeeded(wasStrong ? "Authenticator app set up." : "Authenticator app set up. Your other sessions were signed out.", {
      recoveryCodes: result.recoveryCodes ?? undefined,
    });
  } catch {
    return failed(UNEXPECTED);
  }
}

export async function removeTotpAction(_previous: SecurityState, formData: FormData): Promise<SecurityState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return failed(access.error);
  const { user } = access;
  const verified = await confirmPassword(user, formData.get("password"));
  if (!verified.ok) return failed(verified.error);
  try {
    await removeTotp(user);
    await invalidateUserSessionState(user.id);
    revalidatePath(ACCOUNT_PATH);
    return succeeded("Authenticator app removed.");
  } catch {
    return failed(UNEXPECTED);
  }
}

export async function regenerateRecoveryCodesAction(_previous: SecurityState, formData: FormData): Promise<SecurityState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return failed(access.error);
  const { user } = access;
  const verified = await confirmPassword(user, formData.get("password"));
  if (!verified.ok) return failed(verified.error);
  try {
    if (!(await strongNow(user.id))) return failed("Set up an authenticator app or a passkey first.");
    const recoveryCodes = await issueRecoveryCodes(user);
    revalidatePath(ACCOUNT_PATH);
    return succeeded("New recovery codes made. The old ones no longer work.", { recoveryCodes });
  } catch {
    return failed(UNEXPECTED);
  }
}

export type PasskeyRegistrationOptions = { ok: true; challengeId: string; options: unknown } | { ok: false; error: string };

export async function passkeyRegistrationOptionsAction(): Promise<PasskeyRegistrationOptions> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return { ok: false, error: access.error };
  try {
    const created = await passkeys.registrationOptions(access.user, { rpID: await requestRelyingParty() });
    return { ok: true, challengeId: created.challengeId, options: created.options };
  } catch {
    return { ok: false, error: UNEXPECTED };
  }
}

export async function verifyPasskeyRegistrationAction(input: { challengeId: string; response: RegistrationResponseJSON; name: string }): Promise<SecurityState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return failed(access.error);
  const { user } = access;
  if (typeof input?.challengeId !== "string" || !input.response || typeof input.response.id !== "string") return failed("The passkey answer was not readable. Try again.");
  try {
    const wasStrong = await strongNow(user.id);
    const result = await passkeys.verifyRegistration(user, { challengeId: input.challengeId, response: input.response, name: String(input.name ?? "") });
    if (!result.ok) return failed(result.reason === "expired" ? "That took too long. Try adding the passkey again." : "The passkey could not be verified. Try again.");
    await afterStrongFactorAdded(user, wasStrong);
    revalidatePath(ACCOUNT_PATH);
    return succeeded(wasStrong ? "Passkey added." : "Passkey added. Your other sessions were signed out.", { recoveryCodes: result.recoveryCodes ?? undefined });
  } catch {
    return failed(UNEXPECTED);
  }
}

export async function removePasskeyAction(_previous: SecurityState, formData: FormData): Promise<SecurityState> {
  const access = await authorizeAction(null, OPTIONS);
  if (!access.ok) return failed(access.error);
  const { user } = access;
  const id = String(formData.get("id") ?? "");
  const verified = await confirmPassword(user, formData.get("password"));
  if (!verified.ok) return failed(verified.error);
  try {
    if (!(await passkeys.removePasskey(user, id))) return failed("That passkey no longer exists.");
    await invalidateUserSessionState(user.id);
    revalidatePath(ACCOUNT_PATH);
    return succeeded("Passkey removed.");
  } catch {
    return failed(UNEXPECTED);
  }
}
