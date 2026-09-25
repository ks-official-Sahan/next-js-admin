import "server-only";

import { sendEmail } from "@/lib/email";
import { forcedLogout } from "@/lib/email/templates";

/**
 * Emails a user that an administrator ended their sessions. Not a Server
 * Function on purpose: a "use server" module would expose it as an endpoint.
 */
export async function notifyForcedLogout(input: {
  to: string;
  name: string | null;
  by: string;
  reason?: string;
}): Promise<void> {
  const rendered = forcedLogout({ name: input.name, by: input.by, reason: input.reason });
  await sendEmail({
    to: input.to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    category: "security",
  }).catch(() => undefined);
}
