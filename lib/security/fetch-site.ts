// `Sec-Fetch-Site` tells the server whether a request's initiator was the
// same origin, a same-site (related) origin, none (typed URL, bookmark), or
// a different site entirely. Every modern browser sends it on navigations
// and fetches. A side-effecting GET (a CSV export that is also audited as
// "exported") must not be reachable by a cross-site top-level navigation —
// an <img>, <a>, or auto-submitting <form> on someone else's page — so
// "cross-site" is refused. Anything else (same-origin, same-site, or the
// header missing entirely, which only very old browsers or non-browser
// clients do) is let through unchanged.
export function isCrossSiteFetch(header: string | null | undefined): boolean {
  return header === "cross-site";
}

/**
 * Stricter, for a GET that changes state for the whole account (sign-out):
 * only the same origin, a typed URL or bookmark ("none"), or a missing header
 * pass. A sibling subdomain ("same-site") is refused like another site.
 */
export function isSameOriginOrDirect(header: string | null | undefined): boolean {
  return header === null || header === undefined || header === "same-origin" || header === "none";
}
