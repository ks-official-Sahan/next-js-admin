# Admin CMS, cache and security rules

These are the security rules this admin panel is built on. Keep following
them for any new admin action or route. Operator guide: `docs/admin.md`.

- **Every mutating admin path is gated before it does anything.** Every
  Server Action in `lib/actions/*` calls `authorizeAction(permission)` first;
  every `app/api/admin/*` route calls `hasPermission(user, permission)` and
  returns `notFound()` (never 403) on failure — an unauthorized admin
  surface must never confirm it exists. Add the same two calls, in that
  order, to any new admin action or route before writing its actual logic.
- **Audit inside the same transaction as the mutation.** `lib/audit`'s
  `audit()` call goes inside the `db.$transaction` that makes the change, so
  a rolled-back mutation never leaves an audit row behind, and a written
  audit row is always paired with a mutation that actually happened.
- **Secrets are parameters, never read from inside a shared pure function.**
  A function like `signMediaUrl`/`verifyBypassCookie` takes the secret as an
  argument; the caller resolves it once from `env` (or `process.env`, for
  code that runs before `lib/env.ts`'s `server-only` import can load, like
  `proxy.ts`). This makes every function unit-testable without a live secret
  and means rotating a secret never needs a code change.
- **Compare secrets in constant time.** Use `constantTimeEqual` from
  `lib/admin/login-unlock.ts` (hashes both sides through SHA-256 before
  `crypto.timingSafeEqual`, so length never leaks) for any new secret or
  token comparison — never a manual loop or `===`.
- **Every cache-invalidating action calls `invalidate(plan)` from
  `lib/cache/invalidate.ts`**, and separately calls `revalidatePath` for any
  admin list page that shows the changed row (see `lib/actions/blog.ts`'s
  publish/feature/delete actions for the pattern) — `invalidate()` only
  covers public paths and cache tags, not the admin panel's own pages.
- **Rich text is sanitized on both write and read** (`lib/cms/rich-text.ts`'s
  `sanitizeRich`), because a value already in the database is never trusted
  as pre-sanitized. Any new field that stores HTML needs to go through it on
  both sides, not just one.
- **Origin/CSRF checks in `proxy.ts` cover every unsafe-method `/api/*`
  request except `/api/cron/*`**, not just `/admin` and `/api/admin`. A new
  public `POST`/`PUT`/`PATCH`/`DELETE` route is covered automatically by the
  `isApi(pathname) && !cronPath` check — don't add a route-local origin
  check unless it needs something the shared one doesn't (see
  `app/api/contact/route.ts`/`app/api/chat/route.ts` for the additional
  rate-limit checks those two carry on top of the shared origin check).
- **`AUTH_SECRET` gates production startup.** `assertProductionEnv()` refuses
  to start in production with a missing or short secret, or with
  `EMAIL_PROVIDER=capture`. Don't relax this for convenience.
