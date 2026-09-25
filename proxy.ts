import { isUnlockSecret, signUnlockCookie, UNLOCK_QUERY, unlockCookieOptions, unlockKeysFromEnv, verifyTokenTag, verifyUnlockCookie } from "@sahan-sac/auth-kit";
import { buildCsp, clientIp, generateNonce, isAllowedOrigin, isScannerPath, parseOriginList, shouldBlockAdminByAllowlist, UNKNOWN_IP } from "@sahan-sac/auth-kit/security";
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

import { UNLOCK_COOKIE } from "@/lib/admin/login-unlock";
import {
  bypassKeysFromEnv,
  BYPASS_COOKIE,
  BYPASS_QUERY,
  bypassCookieOptions,
  isMaintenanceExempt,
  isValidBypassSecret,
  signBypassCookie,
  verifyBypassCookie,
} from "@/lib/admin/maintenance-bypass";
import { CONFIRM_EMAIL_PATH, FORGOT_PASSWORD_PATH, LOCKED_PATH, LOGIN_PATH, SESSION_COOKIE, SET_PASSWORD_PATH } from "@/lib/auth/constants";
import { authKit } from "@/lib/auth/kit-config";
import { limit } from "@/lib/cache/ratelimit";
import { log } from "@/lib/log";
import { readKvSetting } from "@/lib/settings/kv";

// Optimistic checks only: the proxy reads cookies and never the database. The
// data access layer (lib/auth/dal.ts) is the authority. Responsibilities 1, 2, 3, 4, 5
// and 6 of docs/plan/admin-cms-adr.md, section 4.5.

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PRODUCTION = process.env.NODE_ENV === "production";

const isAdminPage = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");
const isAdminApi = (pathname: string) => pathname === "/api/admin" || pathname.startsWith("/api/admin/");
const isCron = (pathname: string) => pathname === "/api/cron" || pathname.startsWith("/api/cron/");
const isApi = (pathname: string) => pathname === "/api" || pathname.startsWith("/api/");

/** Same 404 as any unknown URL: the rewrite target matches no route. */
function locked(request: NextRequest): NextResponse {
  const response = NextResponse.rewrite(new URL(LOCKED_PATH, request.url));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function extraOrigins(): string[] {
  return parseOriginList(process.env.ADMIN_ALLOWED_ORIGINS);
}

/** Explicit config instead of environment-implicit trust (finding #15): the app's own authKit.trustProxy decides, not an ad hoc env read at each call site. */
function ip(request: NextRequest): string {
  return clientIp(request.headers, authKit.trustProxy);
}

async function sessionToken(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  try {
    return await getToken({ req: request, secret, cookieName: SESSION_COOKIE, salt: SESSION_COOKIE });
  } catch {
    return null;
  }
}

/** Maintenance flag from the KV mirror; not set or unreadable reads as off. */
async function isMaintenanceActive(): Promise<boolean> {
  return Boolean((await readKvSetting("maintenance"))?.enabled);
}

/** IP allowlist from the KV mirror; not set or unreadable reads as empty (fail-open, see step 5). */
async function getIpAllowlist(): Promise<string[]> {
  return (await readKvSetting("security.ipAllowlist"))?.ips ?? [];
}

/**
 * Serve a maintenance page (503 Service Unavailable).
 * Public response indicates the service is temporarily down.
 */
function maintenancePage(): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Maintenance</title>
  <style>body{font-family:sans-serif;text-align:center;padding:2rem}h1{font-size:2rem}p{color:#666}</style>
</head>
<body>
  <h1>Maintenance in Progress</h1>
  <p>The site is temporarily unavailable. Please try again later.</p>
</body>
</html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "3600",
        "X-Robots-Tag": "noindex, nofollow, nocache",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}

/** Nonce CSP for one admin request; Next reads the nonce from the request header. */
function withCsp(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildCsp({ nonce, dev: !PRODUCTION, imgHosts: authKit.csp.imgHosts, connectHosts: authKit.csp.connectHosts, allowInlineStyles: authKit.csp.allowInlineStyles });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // 1. Scanner paths get a bare 404.
  if (isScannerPath(pathname)) return new NextResponse(null, { status: 404 });

  const adminPage = isAdminPage(pathname);
  const adminApi = isAdminApi(pathname);
  const cronPath = isCron(pathname);

  const now = Date.now();
  const bypassKeys = bypassKeysFromEnv();
  const bypassCookie = request.cookies.get(BYPASS_COOKIE)?.value;
  const hasBypassCookie = bypassKeys ? verifyBypassCookie(bypassCookie, now, bypassKeys) : false;

  // 2. Origin check for unsafe methods on /admin, /api/admin, and public
  // /api (not cron). Runs before maintenance mode so it also covers public
  // API routes like /api/contact and /api/chat, which otherwise return
  // inside the maintenance block below and never reach this check.
  if (UNSAFE_METHODS.has(request.method) && (adminPage || adminApi || (isApi(pathname) && !cronPath))) {
    const allowed = isAllowedOrigin(request.headers.get("origin"), {
      hosts: [request.headers.get("host"), request.headers.get("x-forwarded-host")],
      siteUrl: process.env.SITE_URL,
      extraOrigins: extraOrigins(),
    });
    if (!allowed) {
      // The admin surface never answers 403, so it cannot be told from a missing page.
      return adminPage || adminApi ? locked(request) : new NextResponse(null, { status: 403 });
    }
  }

  // 3. Maintenance mode for public paths. isMaintenanceExempt (pure, unit
  // tested in lib/admin/maintenance-bypass.test.ts) is the single source of
  // truth for the exemption rule: admin pages, admin API, cron, and a valid
  // bypass cookie. Called here with hasBypassCookie=false, it reduces to the
  // path-only check that decides whether to enter this block at all.
  if (!isMaintenanceExempt(pathname, false)) {
    const maintenance = await isMaintenanceActive();
    if (maintenance && !isMaintenanceExempt(pathname, hasBypassCookie)) {
      return maintenancePage();
    }

    // 2a. Bypass query for maintenance: ?bypass-secret=...
    if (maintenance && searchParams.has(BYPASS_QUERY) && bypassKeys) {
      const callerIp = ip(request);
      // Same R22 rule as the unlock query below: an unknown IP is shared by
      // every caller, so limiting it would let one caller lock the owner out.
      const limited = callerIp === UNKNOWN_IP ? false : !(await limit("maintenance:ip", callerIp)).ok;
      const accepted = !limited && isValidBypassSecret(searchParams.get(BYPASS_QUERY), bypassKeys);
      if (!accepted) {
        log.warn("maintenance bypass refused", { ip: callerIp, limited });
        return maintenancePage();
      }
      const clean = request.nextUrl.clone();
      clean.searchParams.delete(BYPASS_QUERY);
      const response = NextResponse.redirect(clean, 307);
      response.cookies.set(
        BYPASS_COOKIE,
        signBypassCookie(now, bypassKeys),
        bypassCookieOptions(PRODUCTION)
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    // Public pages continue normally
    return NextResponse.next();
  }

  if (!adminPage && !adminApi) return NextResponse.next();

  // 5. IP allowlist for /admin and /api/admin.
  // Fail-open when the list is empty (nothing configured) and also when the
  // caller's IP cannot be determined (R22: without TRUSTED_PROXY_HOPS, or off
  // Vercel, every caller reads as "unknown"). An allowlist that fail-closed on
  // an unknown IP would lock out every visitor, including the owner, the
  // moment it is turned on outside a trusted-proxy deployment; failing open in
  // that one case keeps the allowlist a real filter for identified callers
  // while never turning into a silent full lockout. This is logged loudly so
  // the gap is visible in production logs, and documented in the settings UI.
  if (adminPage || adminApi) {
    const allowlist = await getIpAllowlist();
    if (allowlist.length > 0) {
      const callerIp = ip(request);
      if (callerIp === UNKNOWN_IP) {
        log.warn("admin IP allowlist is on but the client IP is unknown (set TRUSTED_PROXY_HOPS); allowing through");
      } else if (shouldBlockAdminByAllowlist(callerIp, allowlist)) {
        log.warn("admin access blocked by IP allowlist", { ip: callerIp });
        return locked(request);
      }
    }
  }

  const keys = unlockKeysFromEnv();

  // 4a. Unlock query: /admin or /admin/login with ?secret=...
  if (adminPage && searchParams.has(UNLOCK_QUERY) && (pathname === "/admin" || pathname === LOGIN_PATH)) {
    const callerIp = ip(request);
    // Same R22 fail-open rule as the IP allowlist above: without
    // TRUSTED_PROXY_HOPS (or off Vercel), every caller shares UNKNOWN_IP, so
    // rate-limiting it for real would let one caller exhaust the bucket for
    // everyone, including the owner. The unlock secret's own entropy is the
    // real defense here, not the per-IP counter.
    const limited = callerIp === UNKNOWN_IP ? false : !(await limit("unlock:ip", callerIp)).ok;
    if (callerIp === UNKNOWN_IP) log.warn("admin unlock: client IP is unknown (set TRUSTED_PROXY_HOPS); rate limit skipped");
    const accepted = !limited && keys !== null && isUnlockSecret(searchParams.get(UNLOCK_QUERY), keys);
    if (!accepted || !keys) {
      log.warn("admin unlock refused", { ip: callerIp, limited, configured: keys !== null });
      return locked(request);
    }
    const clean = request.nextUrl.clone();
    clean.searchParams.delete(UNLOCK_QUERY);
    const response = NextResponse.redirect(clean, 307);
    response.cookies.set(
      UNLOCK_COOKIE,
      signUnlockCookie(now, keys),
      unlockCookieOptions(PRODUCTION)
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  // 4b. An invite or reset link carries an HMAC tag only this server can make, so a
  // link that verifies reaches the set-password page without the unlock cookie. The
  // page and the action still check the token in the database (single use, expiry).
  if (
    adminPage &&
    (pathname === SET_PASSWORD_PATH || pathname === CONFIRM_EMAIL_PATH) &&
    verifyTokenTag(searchParams.get("token"), process.env.AUTH_SECRET)
  ) {
    return withCsp(request);
  }

  // 4c. Optimistic session check: signature and expiry only.
  const token = await sessionToken(request);
  const signedIn = Boolean(token?.sid);

  if (adminApi) return signedIn ? withCsp(request) : locked(request);

  const unlocked = keys ? verifyUnlockCookie(request.cookies.get(UNLOCK_COOKIE)?.value, now, keys) : false;
  if (!signedIn && !unlocked) return locked(request);

  if (!signedIn && pathname !== LOGIN_PATH && pathname !== FORGOT_PASSWORD_PATH) {
    const login = request.nextUrl.clone();
    login.pathname = LOGIN_PATH;
    login.search = "";
    login.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
    const response = NextResponse.redirect(login, 307);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  // 6. Headers for an allowed admin request.
  return withCsp(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|map|woff2?|ttf|otf|mp3|mp4|webm)$).*)",
  ],
};
