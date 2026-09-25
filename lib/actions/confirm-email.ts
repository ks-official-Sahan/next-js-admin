"use server";

import { z } from "zod";

import { audit } from "@/lib/admin/audit";
import { fail, formValues, type ActionState } from "@/lib/actions/state";
import { hashToken, tokenState, verifyTokenTag } from "@/lib/auth/invite-token";
import { revokeUserSessions } from "@/lib/auth/session-store";
import { db } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email";
import { emailChanged } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import { requestDetails } from "@/lib/security/request-device";

// Consumes an EMAIL_CHANGE link (lib/actions/account.ts's requestEmailChangeAction
// creates it). Same trust model as lib/actions/set-password.ts: the link itself
// is the credential, claimed with one conditional update so it works exactly
// once even when two requests race. No session is required to land here —
// proxy.ts lets CONFIRM_EMAIL_PATH through on a valid HMAC tag alone — but the
// row still carries the userId the change was requested for.

const INVALID = "This link is no longer valid. Ask for a new one from your account page.";

class LinkUsed extends Error {}

const fields = z.object({ token: z.string().max(128) });

export async function confirmEmailChangeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = fields.safeParse(formValues(formData));
  if (!parsed.success) return fail(INVALID);

  const random = verifyTokenTag(parsed.data.token, getEnv().AUTH_SECRET);
  if (!random) return fail(INVALID);
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(random) } });
  if (!row || row.purpose !== "EMAIL_CHANGE" || !row.userId || tokenState(row, Date.now()) !== "valid") {
    return fail(INVALID);
  }

  let changed: { userId: string; oldEmail: string; newEmail: string; name: string | null } | null = null;
  try {
    await db.$transaction(async (tx) => {
      const claimed = await tx.authToken.updateMany({
        where: { id: row.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new LinkUsed();

      const user = await tx.user.findUnique({
        where: { id: row.userId! },
        select: { id: true, email: true, name: true, disabledAt: true },
      });
      if (!user || user.disabledAt) throw new LinkUsed();
      // A second EMAIL_CHANGE link asking for a different address could have
      // been issued and used first; the address this link names must still
      // be free.
      if (await tx.user.findUnique({ where: { email: row.email }, select: { id: true } })) throw new LinkUsed();

      await tx.user.update({ where: { id: user.id }, data: { email: row.email } });
      await audit(
        {
          action: "user.email_changed",
          actor: { id: user.id, email: row.email },
          entityType: "User",
          entityId: user.id,
          before: { email: user.email },
          after: { email: row.email },
        },
        tx
      );
      changed = { userId: user.id, oldEmail: user.email, newEmail: row.email, name: user.name };
    });
  } catch (error) {
    if (error instanceof LinkUsed) return fail(INVALID);
    return fail("Something went wrong. Your email was not changed.");
  }

  const result = changed as { userId: string; oldEmail: string; newEmail: string; name: string | null } | null;
  if (result) {
    // Identity changed: every session (including the one that asked for the
    // change) ends, matching the password-change pattern. Sign in again with
    // the new address.
    await revokeUserSessions(result.userId, { userId: result.userId, reason: "email_changed" });
    const rendered = emailChanged({ ...(await requestDetails(result.name)), newEmail: result.newEmail });
    // Notice goes to the OLD address, since that inbox owner is who should
    // learn the account moved, even though they no longer hold the new one.
    await sendEmail(
      { to: result.oldEmail, subject: rendered.subject, html: rendered.html, text: rendered.text, category: "security" },
      { actor: { id: result.userId, email: result.newEmail } }
    ).catch(() => undefined);
  }

  return { ok: true, message: "Your email address was changed. Sign in with your new address.", error: null };
}
