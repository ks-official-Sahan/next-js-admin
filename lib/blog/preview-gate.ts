import { verifyShareToken } from "./share-link";

// The first gate on /preview/*, run in proxy.ts before anything renders.
// Cache Components prerenders a static shell for these routes, and once that
// shell is sent the status is 200: a notFound() in the page would answer a
// soft 404. So a request that cannot be allowed is answered 404 here instead.
// It is only the cheap half of the check: the page still verifies the session
// and its permission (app/(site)/preview/**/page.tsx).

const POST_PREVIEW = /^\/preview\/post\/([\w-]{1,64})\/?$/;

/**
 * Whether a /preview request may reach the page: a post preview needs a valid
 * share token or a session cookie, a page preview a session cookie. Null for
 * any other path. Pure; the caller passes the share key (null without
 * AUTH_SECRET, when no link can verify).
 */
export function previewRequestAllowed(
  pathname: string,
  token: string | null,
  signedIn: boolean,
  shareKey: string | null,
  now = Date.now()
): boolean | null {
  if (pathname !== "/preview" && !pathname.startsWith("/preview/")) return null;
  if (signedIn) return true;
  const post = POST_PREVIEW.exec(pathname);
  return post !== null && shareKey !== null && verifyShareToken(post[1], token, shareKey, now);
}
