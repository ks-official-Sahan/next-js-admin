# Admin panel: operator guide

This is for whoever runs the site day to day: the owner or a developer
setting up a new environment. For the security rules this admin panel is
built on, see `docs/SECURITY-RULES.md`.

## First-time setup

1. Copy `.env.example` to `.env.local` and fill in at least `DATABASE_URL`
   plus every variable marked `(admin)`. Run
   `pnpm exec tsx scripts/check-env-example.mts` any time you add a new
   variable to `lib/env.ts` — it fails if `.env.example` and the code
   disagree, and it never prints a value.
2. `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` seed the first owner
   account (role `DEVELOPER`). The password is temporary — change it on
   `/admin/account` on first sign-in.
3. `AUTH_SECRET`, `INTERNAL_SIGNING_SECRET`, `MEDIA_SIGNING_SECRET`,
   `MAINTENANCE_BYPASS_SECRET`, `ADMIN_LOGIN_UNLOCK_SECRET`, `CRON_SECRET`:
   random values, at least 32 characters (the two unlock/bypass secrets can
   be as short as 12). Generate with `openssl rand -base64 32` or similar.
   Production refuses to start with a missing or short value once
   `DATABASE_URL` is set.
4. Run migrations (`pnpm exec prisma migrate deploy`, or `migrate dev`
   locally) — or `pnpm db:push` for a fresh database. The schema defaults to
   `public`; if you share one Postgres instance across projects, give this
   one its own schema and update `lib/db/url.ts`'s `ALLOWED_SCHEMAS`.

## Unlock and sign in

The admin panel is hidden behind two independent gates, both enforced in
`proxy.ts` before any page renders:

1. **Unlock.** `/admin` answers a 404-shaped "locked" page to anyone without
   a valid unlock cookie. Get one by visiting
   `https://<site>/admin?secret=<ADMIN_LOGIN_UNLOCK_SECRET>` once — the query
   string is stripped and a signed, httpOnly cookie is set for 2 hours.
   Unlock attempts are rate-limited per IP; repeated wrong secrets lock you
   out for a while.
2. **Sign in.** Once unlocked, `/admin/login` is a normal email + password
   form (plus MFA if the account has it turned on, from `/admin/account`).
   A wrong password does not reveal whether the email exists.

If you're locked out of both (secret lost, cookie expired, no browser
access), see "Break-glass" below.

## Roles and permissions

Four roles, from `lib/auth/permissions.ts`: `DEVELOPER` (everything, the only
role that can manage other users, settings, and the IP allowlist), `MANAGER`
(content, blog, media, leads, chatbot — day-to-day content and enquiries),
`EDITOR` (drafts only — can create and edit but not publish, and cannot
manage anything). The exact matrix lives in `lib/auth/permissions.ts`; this
doc doesn't repeat it because it changes as the app grows. The rule that
doesn't change: every Server Action and every `app/api/admin/*` route checks a
permission before doing anything, and a missing permission looks like a
missing page (404), never a 403 — an unauthorized admin surface should never
confirm it exists.

## Add a user

`/admin/users` → "Invite user" (needs `inviteUser`; an `EDITOR` account, if
you have one with elevated invite rights, can only invite other `EDITOR`s).
The invite is a one-time signed link, expires, and the new user sets their
own password on first use — nobody ever sees or sets another person's
password directly. To change an existing user's role or disable them, use
the same page (`manageUsers`); the system refuses to demote, disable or
delete the last enabled `DEVELOPER`, so you can't lock yourself out of user
management entirely.

## Restore a content version

Every CMS section (`ContentBlock`) keeps its previous versions. On the
section's edit page, open version history and pick
"Restore" on the version you want back — this writes a new draft from that
version's data (never a hard rewrite of history) and still runs the same
publish flow, so publishing the restored draft is a separate, explicit step.
If the version no longer passes the current schema (a field was added since
it was saved), the restore is refused with a message saying so, rather than
silently dropping data.

## Rotate a secret

All of the secrets in `.env.example`'s "Auth and signing" block can be
rotated independently, at different costs:

- `AUTH_SECRET`: rotating this signs everyone out (all sessions, all unlock
  and bypass cookies become invalid) and invalidates every outstanding
  invite/reset link. Use it if you suspect a session or link leaked.
- `MEDIA_SIGNING_SECRET`: rotating this invalidates every signed `/media/*`
  URL currently cached or shared (browsers, CDNs). Public pages regenerate
  new signed URLs on their next render; nothing breaks, but any externally
  saved media link stops working.
- `MAINTENANCE_BYPASS_SECRET`, `ADMIN_LOGIN_UNLOCK_SECRET`: rotating either
  signs everyone out of that specific bypass/unlock cookie only. Do this on
  its own schedule, or immediately if the secret leaked (e.g. pasted in the
  wrong chat).
- `CRON_SECRET`: rotate on Vercel and in `.env.local`/the deployment's env
  vars together — the two values must match, or every scheduled cron call
  starts failing its own auth check (fails closed, so nothing runs instead
  of running unauthenticated).
- `INTERNAL_SIGNING_SECRET`: used for internal HMACs (e.g. the contact form's
  IP hash). Rotating it just means IP hashes from before the rotation no
  longer match hashes computed after — low-stakes, rotate whenever.

General rule: every secret is read once from `env` at the route/action
boundary and passed as an explicit parameter into the function that uses it
(never read from inside a shared pure function) — so rotating a secret never
requires a code change, only an env var change and a redeploy/restart.

### Rotation checklist

Whenever a secret leaks, is due for a scheduled rotation, or an employee
with access leaves:

1. Generate the new value (`openssl rand -base64 32`, or per-secret length
   above).
2. Set it in Vercel's Environment Variables (and `.env.local` for anyone
   running the admin panel locally).
3. Redeploy (or restart the local server) so the new value is read.
4. Confirm the effect matches the table above (e.g. rotating `AUTH_SECRET`
   should sign you out — sign back in to confirm).
5. Note the rotation date somewhere outside this repo (a password manager
   entry, a ticket) — this file intentionally never records when a secret
   was last rotated, since that alone tells an attacker something.
6. If the leak was `CRON_SECRET`, also check `/admin/audit` for any cron job
   run you didn't expect around the leak window.

## Vercel environment setup

Set every `.env.example` variable marked `(admin)` in the Vercel project's
Environment Variables, scoped to Production (and Preview if you want a
working admin panel on preview deployments — set `ADMIN_ALLOWED_ORIGINS` to
include the preview domain pattern if so). `vercel.json` already declares the
daily cron schedules for `/api/cron/{blog-publish,session-cleanup,audit-prune}`;
Vercel calls them with `Authorization: Bearer ${CRON_SECRET}` automatically
once the env var is set — nothing else to configure.

If you're behind Vercel, `clientIp()` reads Vercel's own forwarded-IP header
and needs no extra configuration. Behind any other reverse proxy (a
self-hosted deployment), set `TRUSTED_PROXY_HOPS` to how many of your own
proxies append to `X-Forwarded-For`, or every caller is treated as unknown
and the IP allowlist and per-IP rate limits stop being effective (they fail
open on an unknown IP rather than locking everyone out).
`TRUSTED_PROXY_HOPS` is a count, not a flag: `1` for one nginx in front of
the app. `true` is not a number and is ignored, so it trusts nothing. Never
set it on a deployment that is reachable without going through your proxy,
or callers can forge their IP.

### Upgrade note: `__Host-` cookies

In production the admin session and unlock cookies are named with the
`__Host-` prefix (`__Host-app_admin_session`, `__Host-app_admin_unlock`),
which the browser only accepts over HTTPS, for the exact host, on `Path=/`.
The first deploy that ships this signs every admin out once, and the unlock
cookie has to be earned again through the unlock link. Nothing else changes;
local development keeps the plain names because it runs on plain HTTP.

## Break-glass for Redis

Rate limits, the maintenance flag, and the IP allowlist are all mirrored
into Upstash Redis (or an in-memory fallback locally) because `proxy.ts` has
no database access. If Redis is down or misconfigured:

- Maintenance mode fails to its safe default: **not** in maintenance. The
  public site stays up; you can't accidentally lock visitors out because
  Redis hiccupped.
- The IP allowlist fails to its safe default: **empty** (no filtering). You
  will not be locked out of `/admin` because Redis is unreachable.
- Rate limits fail per their documented per-bucket mode —
  most fail open (the action proceeds) rather than blocking real users
  during an outage. See `docs/SECURITY-RULES.md` for the full list.

So a Redis outage degrades admin protections rather than causing an outage
of its own. To recover: fix `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
and redeploy or restart; the app re-reads settings from Redis on the next
request, no manual resync needed. Settings themselves live in Postgres and
are never lost — Redis is a cache the proxy layer reads, not the source of
truth.

## Verify everything is configured

- `pnpm exec tsx scripts/check-env-example.mts` — `.env.example` matches
  `lib/env.ts`.
- `/admin/settings` → integration health panel — reports database, Redis,
  Resend, Brevo, Cloudinary and the AI provider chain as configured/reachable,
  never printing a secret or a fragment of one.
- `/admin` dashboard → security status widget — shows MFA state and whether
  any account still has a temporary password.
