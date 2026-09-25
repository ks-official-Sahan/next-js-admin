import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import { issueToken } from "@/lib/inquiries/token";

// Issue a signed timing token. Valid from 3 seconds after issuance up to 2 hours.
// The token is used to prevent replay attacks on the contact form.
//
// Deliberately not rate limited: issuing is one HMAC with no side effect, and
// the contact form fetches a token on every mount, so charging it to the
// contact:ip bucket (5 per hour) locked out a visitor who simply opened the
// page a few times. The submission (app/api/contact/route.ts) is what spends
// the per-IP and global budgets. The proxy's origin rule does not apply to a
// GET, and a token alone cannot submit anything.

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const secret = getEnv().INTERNAL_SIGNING_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Token service unavailable" }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ token: issueToken(secret) }, { status: 200, headers: noStore });
}
