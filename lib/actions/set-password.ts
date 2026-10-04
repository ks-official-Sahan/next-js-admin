"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { audit } from "@/lib/admin/audit";
import { UNLOCK_COOKIE, signUnlockCookie, unlockCookieOptions, unlockKeysFromEnv } from "@/lib/admin/login-unlock";
import { fail, fieldErrorsFrom, formValues, type ActionState } from "@/lib/actions/state";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { hashToken, tokenState, verifyTokenTag } from "@/lib/auth/invite-token";
import { hashPassword } from "@/lib/auth/password";
import { checkPassword } from "@/lib/auth/password-policy";
import { revokeUserSessions } from "@/lib/auth/session-store";
import { repos, withTx } from "@/lib/data";
import { sendEmail } from "@/lib/email";
import { passwordChanged } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import { requestDetails } from "@/lib/security/request-device";

// Accepting an invitation and finishing a password reset. Nobody is signed in
// here: the link is the credential. It carries an HMAC tag (checked without the
// database, so the proxy can let it through) and a random part whose SHA-256 is
// the only thing stored. The token is claimed with one conditional update, so a
// link works exactly once even when two requests race
// (design notes, sections 6.5 and 6.6).

const INVALID = "This link is no longer valid. Ask for a new one.";

class LinkUsed extends Error {}

const fields = z.object({
  token: z.string().max(128),
  password: z.string().max(128, "Use at most 128 characters."),
  confirm: z.string().max(128),
  name: z.string().trim().max(80, "Use at most 80 characters.").optional(),
});

export async function setPasswordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = fields.safeParse(formValues(formData));
  if (!parsed.success) return fail("Check the form.", fieldErrorsFrom(parsed.error.issues));
  const { token, password, confirm, name } = parsed.data;

  const random = verifyTokenTag(token, getEnv().AUTH_SECRET);
  if (!random) return fail(INVALID);
  const row = await repos.authTokens.findByHash(hashToken(random));
  if (!row || tokenState(row, Date.now()) !== "valid") return fail(INVALID);

  if (password !== confirm) return fail("The two passwords differ.", { confirm: "Does not match." });
  const policy = checkPassword(password, { email: row.email, name });
  if (!policy.ok) return fail("Choose a stronger password.", { password: policy.problems.join(" ") });

  const passwordHash = await hashPassword(password);
  let cleanup: { userId: string; email: string; name: string | null } | null = null;

  try {
    await withTx(async (tx) => {
      if ((await tx.authTokens.claim(row.id, new Date())) !== 1) throw new LinkUsed();

      if (row.purpose === "INVITE") {
        if (await tx.users.existsByEmail(row.email)) throw new LinkUsed();
        const created = await tx.users.create({
          email: row.email,
          name: name || null,
          role: row.role ?? "EDITOR",
          passwordHash,
          createdById: row.createdById,
        });
        await audit(
          {
            action: "user.invite_accepted",
            actor: { id: created.id, email: row.email },
            entityType: "User",
            entityId: created.id,
            after: { email: row.email, role: row.role },
            meta: { invitedBy: row.createdById },
          },
          tx
        );
        return;
      }

      const user = row.userId ? await tx.users.findRef(row.userId) : null;
      if (!user || user.disabledAt) throw new LinkUsed();
      await tx.users.update(user.id, { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false });
      await audit(
        {
          action: "auth.password.reset_completed",
          actor: { id: user.id, email: user.email },
          entityType: "User",
          entityId: user.id,
        },
        tx
      );
      cleanup = { userId: user.id, email: user.email, name: user.name };
    });
  } catch (error) {
    if (error instanceof LinkUsed) return fail(INVALID);
    return fail("Something went wrong. Your password was not changed.");
  }

  // A reset ends every session: whoever had the old password loses access.
  const done = cleanup as { userId: string; email: string; name: string | null } | null;
  if (done) {
    await revokeUserSessions(done.userId, { userId: done.userId, reason: "password_reset" });
    const rendered = passwordChanged(await requestDetails(done.name));
    await sendEmail(
      { to: done.email, subject: rendered.subject, html: rendered.html, text: rendered.text, category: "security" },
      { actor: { id: done.userId, email: done.email } }
    ).catch(() => undefined);
  }

  // The person just proved they hold a valid link, so the login page may show.
  const keys = unlockKeysFromEnv();
  if (keys) {
    (await cookies()).set(
      UNLOCK_COOKIE,
      signUnlockCookie(Date.now(), keys),
      unlockCookieOptions(process.env.NODE_ENV === "production")
    );
  }
  redirect(`${LOGIN_PATH}?notice=password-set`);
}
