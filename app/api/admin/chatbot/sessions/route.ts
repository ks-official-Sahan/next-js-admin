import { NextResponse, type NextRequest } from "next/server";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { listSessionSummaries } from "@/lib/chatbot/session";
import { parseChatSessionListParams } from "@/lib/chatbot/session-summaries";
import { log } from "@/lib/log";

// JSON for the conversations list's polling (lib/admin/hooks/
// use-chatbot-sessions.ts). Summaries only, never message bodies.
// Unauthorized callers get the same bare 404 as any unknown admin path.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword || !hasPermission(user, "viewChatHistory")) {
    return new NextResponse(null, { status: 404, headers: NO_STORE });
  }

  try {
    const sessions = await listSessionSummaries(parseChatSessionListParams(request.nextUrl.searchParams));
    return NextResponse.json(sessions, { headers: NO_STORE });
  } catch (error) {
    log.error("admin chat sessions list failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Could not load conversations." }, { status: 500, headers: NO_STORE });
  }
}
