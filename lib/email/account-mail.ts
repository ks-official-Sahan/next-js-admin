import "server-only";

import { copyRecipients, type EmailCategory, type SendOptions, type SendResult } from "@sahan-sac/email-kit";
import { after } from "next/server";

import { sendEmail } from "@/lib/email";
import type { Rendered } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import { getSetting } from "@/lib/settings/service";

// Account emails (invitation, account created, password reset) go to their
// recipient, and a redacted copy goes to EMAIL_CC while the "Copy account
// emails" setting is on. The copy never carries a link: whoever holds an
// invite or reset link can take the account, so a CC with the link would hand
// that power to every copied inbox (design notes, council
// decision "copy without the link").

/** EMAIL_CC minus the recipient, or nothing while the setting is off. */
export async function accountCopyRecipients(recipient: string): Promise<string[]> {
  const cc = getEnv().EMAIL_CC;
  if (cc.length === 0) return [];
  const routing = await getSetting("email.routing");
  // A value cached before the field existed has no authCopyEnabled: that means on (the default).
  return routing.authCopyEnabled !== false ? copyRecipients(cc, [recipient]) : [];
}

export async function sendAccountEmail(input: {
  to: string;
  /** Called once for the original and, when a copy is due, once with `{ copy: true }`. */
  render: (options: { copy?: boolean }) => Rendered;
  category: EmailCategory;
  actor?: SendOptions["actor"];
}): Promise<SendResult> {
  const { to, category, actor } = input;
  const rendered = input.render({});
  const sent = await sendEmail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text, category }, { actor });
  // Only a delivered original gets a copy, and only after the response, so the
  // copy never slows the action down or changes what it reports.
  if (sent.ok) {
    after(async () => {
      const cc = await accountCopyRecipients(to).catch(() => []);
      if (cc.length === 0) return;
      const copy = input.render({ copy: true });
      await sendEmail({ to: cc, subject: copy.subject, html: copy.html, text: copy.text, category }, { actor }).catch(() => undefined);
    });
  }
  return sent;
}
