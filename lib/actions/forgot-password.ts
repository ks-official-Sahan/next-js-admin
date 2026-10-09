"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { audit } from "@/lib/admin/audit";
import { done, fail, fieldErrorsFrom, formValues, type ActionState } from "@/lib/actions/state";
import { RESET_TTL_MINUTES, createToken } from "@/lib/auth/invite-token";
import { accountLink, signInLink } from "@/lib/auth/links";
import { limit } from "@/lib/cache/ratelimit";
import { clientIp, UNKNOWN_IP } from "@/lib/security/ip";
import { repos, withTx } from "@/lib/data";
import { sendAccountEmail } from "@/lib/email/account-mail";
import { passwordReset } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";

// Self-service "forgot password", reachable while signed out (proxy.ts lets
// FORGOT_PASSWORD_PATH through without a session or the admin unlock cookie's
// enumeration). Every outcome returns the same generic message regardless of
// whether the address exists, is disabled, or the email failed to send — an
// attacker probing this form must not learn which accounts exist. The link
// itself reuses PASSWORD_RESET (lib/actions/users.ts's sendReset does the
// admin-triggered version of the identical flow).

const GENERIC = "If that address has an account, a reset link was just sent to it.";

const fields = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

export async function requestPasswordResetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = fields.safeParse(formValues(formData));
  if (!parsed.success) return fail("Enter a valid email address.", fieldErrorsFrom(parsed.error.issues));
  const { email } = parsed.data;

  const ip = clientIp(await headers());
  // An unknown IP (no TRUSTED_PROXY_HOPS) fails open here too, matching the
  // R22 pattern elsewhere: this form has its own per-email limit as a backstop.
  if (ip !== UNKNOWN_IP && !(await limit("reset:ip", ip)).ok) return fail("Too many attempts. Try again later.");
  if (!(await limit("reset:email", email)).ok) return done(GENERIC);

  const user = await repos.users.findRefByEmail(email);

  // Silently do nothing for an unknown or disabled account, but still return
  // the generic message: the response must look identical either way.
  if (user && !user.disabledAt) {
    const secret = getEnv().AUTH_SECRET;
    if (secret) {
      const { token, hash } = createToken(secret);
      try {
        const row = await withTx(async (tx) => {
          await tx.authTokens.revokeOpenForUser("PASSWORD_RESET", user.id);
          const created = await tx.authTokens.create({
            purpose: "PASSWORD_RESET",
            email,
            userId: user.id,
            tokenHash: hash,
            expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
          });
          await audit(
            { action: "auth.password.reset_requested_self", actor: { id: user.id, email }, entityType: "User", entityId: user.id },
            tx
          );
          return created;
        });

        const url = await accountLink(token);
        const signInUrl = (await signInLink()).url;
        const sent = await sendAccountEmail({
          to: email,
          render: (options) => passwordReset({ name: user.name, url, expiresMinutes: RESET_TTL_MINUTES, signInUrl }, options),
          category: "password-reset",
          actor: { id: user.id, email },
        });
        if (!sent.ok) await repos.authTokens.revoke(row.id);
      } catch {
        // Fall through to the generic message regardless of what failed.
      }
    }
  }

  return done(GENERIC);
}
