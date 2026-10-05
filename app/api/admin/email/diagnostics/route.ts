import { NextResponse, type NextRequest } from "next/server";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { getBrevoDiagnostics, getEmailHealth } from "@/lib/email";
import { assertAddress, EmailGuardError } from "@sahan-sac/email-kit/guards";

// Read-only report on email: which providers are configured, and, with `messageId`
// or `email`, what Brevo says happened to a send. Needs the manageSettings
// permission. The proxy already answers 404 to anyone without a session; this
// route checks the permission itself and never relies on that
// (design notes, step 5).

export const dynamic = "force-dynamic";
// Two rounds of Brevo reads at up to 8 s each, plus the session check.
export const maxDuration = 30;

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const user = await getOptionalUser();
  // A missing permission looks like a missing page, and a user who must still
  // choose a password can use nothing but the account page.
  if (!user || user.mustChangePassword || !hasPermission(user, "manageSettings")) {
    return json({ error: "not_found" }, 404);
  }

  const params = request.nextUrl.searchParams;
  const messageId = params.get("messageId")?.trim() || undefined;
  const rawEmail = params.get("email")?.trim() || undefined;

  if (messageId && (messageId.length > 300 || /[\x00-\x1f\x7f]/.test(messageId))) {
    return json({ error: "bad_message_id" }, 400);
  }
  let email: string | undefined;
  if (rawEmail) {
    try {
      email = assertAddress(rawEmail, "email");
    } catch (error) {
      if (error instanceof EmailGuardError) return json({ error: "bad_email" }, 400);
      throw error;
    }
  }

  const diagnostics = await getBrevoDiagnostics({ messageId, email });
  return json({ health: getEmailHealth(), diagnostics });
}
