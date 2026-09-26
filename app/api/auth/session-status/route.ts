import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/constants";
import { getSessionStatus } from "@/lib/auth/dal";

// The session heartbeat polls this every 30 seconds and when the tab regains
// focus (components/admin/shell/SessionHeartbeat). It answers from the same data
// access layer as every page, so a revoked session is seen here as soon as its
// 30 second state cache lapses, which is what makes an idle tab sign out
// (design notes, section 6.3). No session data is returned.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // No cookie, no answer: a stranger gets the same bare 404 as for any unknown URL,
  // so this route does not point at an admin. The heartbeat reads 404 as ended.
  if (!request.cookies.has(SESSION_COOKIE)) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const status = await getSessionStatus();
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Database connection dropped or cold starting; answer 503 so heartbeat backs off and retries
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
