// The break-glass unlock form. The hidden login is normally unlocked by an
// emailed sign-in link (/s/...). When none is at hand (expired, mail down),
// the owner opens ADMIN_UNLOCK_PATH and types (or lets a password manager
// fill) ADMIN_LOGIN_UNLOCK_SECRET into a password field. The form POSTs, so the
// secret never sits in a URL, browser history, address-bar suggestions, a
// Referer header or a request log. The path itself is only a hint: on its own
// it opens an empty form. proxy.ts serves and checks it; this module is pure.

/** Where a configured path may not point: app internals and the admin routes the proxy already owns. */
const RESERVED = /^\/(?:_next|api|admin\/(?:login|forgot-password|set-password|confirm-email|locked))(?:\/|$)/;
const SHAPE = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

/**
 * ADMIN_UNLOCK_PATH as a usable path, or null when unset or unusable (then
 * the legacy `?secret=` unlock stays on, so a deploy without the variable
 * cannot lock the owner out). 8 to 120 characters, letters, digits, `_`, `-`
 * and `/` only, never an app or admin route.
 */
export function unlockFormPath(raw: string | undefined): string | null {
  const path = raw?.trim().replace(/\/+$/, "");
  if (!path || path.length < 8 || path.length > 120 || !SHAPE.test(path) || RESERVED.test(path)) return null;
  return path;
}

/** Largest POST body read from the form; the secret is short. */
export const UNLOCK_FORM_MAX_BYTES = 2048;

/**
 * Headers for the form page: never cached, indexed or framed, and never
 * referred to another site. The referrer policy is `same-origin`, not
 * `no-referrer`: under `no-referrer` a browser sends `Origin: null` on the
 * form's own POST (Fetch spec, "append a request Origin header"), which the
 * proxy's same-origin check refuses, so every unlock attempt came back 404.
 */
export const UNLOCK_FORM_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, nocache",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

/** The page. `action` is a path from unlockFormPath (already restricted to safe characters). */
export function unlockFormHtml({ action, failed }: { action: string; failed: boolean }): string {
  const error = failed ? `<p class="error" role="alert">That did not work. Check the secret and try again.</p>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="same-origin">
  <title>Unlock</title>
  <style>
    :root{color-scheme:light dark;--bg:#fafafa;--card:#fff;--fg:#0a0a0a;--muted:#525252;--border:#e5e5e5;--accent:#0a0a0a;--accent-fg:#fafafa;--error:#b91c1c}
    @media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--card:#111;--fg:#fafafa;--muted:#a3a3a3;--border:#262626;--accent:#fafafa;--accent-fg:#0a0a0a;--error:#f87171}}
    *{box-sizing:border-box}
    body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
    form{width:100%;max-width:360px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:24px}
    h1{margin:0 0 4px;font-size:20px}
    p{margin:0 0 16px;color:var(--muted);font-size:14px}
    label{display:block;font-size:14px;font-weight:500;margin-bottom:6px}
    input{width:100%;height:40px;border:1px solid var(--border);border-radius:6px;padding:0 12px;background:transparent;color:var(--fg);font:inherit}
    input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    button{margin-top:16px;width:100%;height:40px;border:0;border-radius:6px;background:var(--accent);color:var(--accent-fg);font:inherit;font-weight:500;cursor:pointer}
    .error{color:var(--error);margin:12px 0 0}
    .hint{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  </style>
</head>
<body>
  <form method="post" action="${action}" autocomplete="on">
    <h1>Unlock</h1>
    <p>Enter the unlock secret to open the sign-in page.</p>
    <input class="hint" type="text" name="username" value="admin-unlock" autocomplete="username" tabindex="-1" aria-hidden="true" readonly>
    <label for="secret">Unlock secret</label>
    <input id="secret" name="secret" type="password" autocomplete="current-password" required maxlength="512" autofocus>
    ${error}
    <button type="submit">Unlock</button>
  </form>
</body>
</html>`;
}
