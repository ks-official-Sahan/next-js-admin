import { NextResponse, type NextRequest } from "next/server";

import { LOCKED_PATH, LOGIN_PATH, SESSION_COOKIE } from "@/lib/auth/constants";
import { SESSION_COOKIES } from "@/lib/auth/session-cookie";
import { isSameOriginOrDirect } from "@/lib/security/fetch-site";

// A Server Component cannot write cookies [N20], so the data access layer sends a
// browser whose session was revoked, expired or disabled here. The cookie is
// cleared and the browser goes to the login page, which shows the form only while
// the unlock cookie is still valid (design notes, section 6.2).

function hidden(request: NextRequest): NextResponse {
  // Same styled 404 as any unknown URL (proxy.ts `locked`), never a blank page.
  const response = NextResponse.redirect(new URL(LOCKED_PATH, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function GET(request: NextRequest) {
  const site = request.headers.get("sec-fetch-site");
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // A link on another site or a sibling subdomain must not be able to sign
  // the admin out, and a stranger typing this URL learns nothing.
  if (!isSameOriginOrDirect(site) || (!hasSession && site !== "same-origin")) return hidden(request);

  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  // No cookie on a same-origin redirect means the browser already dropped an expired one.
  url.search = hasSession ? "?reason=revoked" : "?reason=expired";

  const response = NextResponse.redirect(url, 303);
  // Path and Secure must match how the engine set the cookies (lib/auth/engine.ts) for
  // the browser to actually clear them — this matters more once SESSION_COOKIE
  // is __Host--prefixed in production, which requires Secure.
  for (const name of SESSION_COOKIES) {
    response.cookies.set(name, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
