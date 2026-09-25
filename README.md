# Admin Template

A production-ready admin panel starter, extracted into a reusable
[GitHub template](https://github.com/ks-official-Sahan/admin-template) and a
`create-admin` CLI. Auth, RBAC, a content CMS, a blog with AI drafting, a
media library, a leads/CRM inbox and a chatbot — all on Next.js, ready to
point at your own database and deploy.

## What's included

- **Admin auth** — login, forgot/set password, email confirmation, MFA, and a
  hidden-unlock gate in front of the whole `/admin` surface
- **Admin shell** — dashboard, account, users, roles/RBAC, sessions, audit
  log (with export), settings
- **Media library** — Cloudinary or a local provider
- **Content CMS** — versioned `ContentBlock` sections, a page editor at
  `/admin/content`, and a live `/preview/[page]`
- **Blog** — `Post`/`PostRevision`, AI-assisted drafting and images, an
  editor, the public `/updates` list and post pages, RSS, sitemap, `llms.txt`
- **Leads/CRM** — an inbox for inquiries, `/api/contact`, a contact page,
  email delivery (Resend or SMTP)
- **Chatbot** — a public widget, `/api/chat`, and admin training/conversation
  screens
- **Security layer** — `proxy.ts` (CSP, origin checks, rate limits), env
  validation, structured logging, cron routes
- A clean, minimal starter home page and neutral placeholder branding
  (`config/site.ts`) — swap in your own name, tagline and links

## Stack

Next.js 16 (App Router, Turbopack, `proxy.ts` instead of middleware), React
19, Prisma 7 (`@prisma/adapter-neon`, works with any Postgres), next-auth 5,
Upstash Redis, TanStack Query (admin only), Tailwind CSS 3, TipTap 3. Package
manager: pnpm.

Auth, RBAC and the security primitives (constant-time secret comparison,
origin checks, rate limiting, login-unlock) live in a separate package,
[`@sahan-sac/auth-kit`](https://github.com/ks-official-Sahan/auth-kit), and
are used here as a normal npm dependency.

## Quick start

### Option A: the CLI

```sh
npm create @sahan-sac/admin@latest my-app
cd my-app
```

This downloads the template, generates fresh random secrets into
`.env.local`, and optionally installs dependencies and runs `git init` for
you. See [`cli/README.md`](cli/README.md) for the full option list
(`--ref`, `--pm`, `--no-install`, `--no-git`).

### Option B: "Use this template" on GitHub

Click **Use this template** on the
[repository page](https://github.com/ks-official-Sahan/admin-template),
clone your new repo, then:

```sh
cp .env.example .env.local
pnpm install
```

## Environment setup

Fill in `.env.local` (copied from `.env.example`, which lists every variable
name — never a real value). At minimum you need `DATABASE_URL` plus the
secrets marked `(admin)` in the file: `AUTH_SECRET`,
`INTERNAL_SIGNING_SECRET`, `MEDIA_SIGNING_SECRET`,
`MAINTENANCE_BYPASS_SECRET`, `ADMIN_LOGIN_UNLOCK_SECRET`, `CRON_SECRET` —
random values, at least 32 characters (the unlock/bypass secrets can be as
short as 12). The CLI generates these for you; scaffolding by hand, generate
them yourself (`openssl rand -base64 32` or similar). Production refuses to
start with a missing or short secret once `DATABASE_URL` is set
(`lib/env-rules.ts`'s `assertProductionEnv`).

## Database setup

Any Postgres works (Neon is what this template is built and tested
against). The schema defaults to `public` — only set `?schema=<name>` on
`DATABASE_URL` if you're sharing one Postgres instance across several
projects (see `lib/db/url.ts`).

```sh
pnpm db:push     # create tables (fresh project — no migration history needed)
# or: pnpm exec prisma migrate deploy   # if you're using migrations
```

## Owner bootstrap

Set `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` in `.env.local`, then:

```sh
pnpm db:seed
```

This creates the first owner account (`DEVELOPER` role) with the temporary
password from `ADMIN_PASSWORD` — change it on `/admin/account` on first
sign-in. Then:

```sh
pnpm dev
```

Visit `https://<your-site>/admin?secret=<ADMIN_LOGIN_UNLOCK_SECRET>` once to
unlock the hidden `/admin` surface (sets a signed cookie for 2 hours), then
sign in at `/admin/login`. Full operator guide, secret rotation, and a Redis
outage runbook: [`docs/admin.md`](docs/admin.md).

## Deployment (Vercel)

Set every `.env.example` variable marked `(admin)` in the project's
Environment Variables (Production, and Preview if you want a working admin
panel on preview deployments). `vercel.json` already declares the daily cron
schedules for `/api/cron/{blog-publish,session-cleanup,audit-prune}` — Vercel
calls them with `Authorization: Bearer $CRON_SECRET}` automatically once the
env var is set. See `docs/admin.md`'s "Vercel environment setup" section for
the rest (`TRUSTED_PROXY_HOPS` behind a non-Vercel proxy, the `__Host-`
cookie prefix in production, and so on).

## Security rules

This admin panel follows a fixed set of rules for every mutating path:
permission checks before any admin action or route runs, audit rows written
inside the same transaction as the mutation, secrets passed as parameters
and compared in constant time, cache invalidation on every write, rich text
sanitized on both write and read, and origin/CSRF checks on every unsafe
`/api/*` request. Full list, with the exact functions involved:
[`docs/SECURITY-RULES.md`](docs/SECURITY-RULES.md).

## Releasing the template and CLI

A git tag `vX.Y.Z` is both the template's release point and the CLI's
version (`cli/package.json`'s `version` must match). The CLI defaults to
downloading the template tag matching its own version
(`create-admin@0.1.0` → template `v0.1.0`), so keep the two in lockstep:

1. Bump `cli/package.json`'s `version`.
2. Commit, then tag: `git tag v0.1.0 && git push --tags`.
3. `.github/workflows/release-cli.yml` runs the CLI's tests and publishes
   `@sahan-sac/create-admin` to npm with `npm publish --provenance` using npm
   Trusted Publishing (OIDC) — no `NPM_TOKEN` secret. Configure this
   repository as a trusted publisher for the package on npmjs.com first.

`.github/workflows/ci.yml` runs on every push/PR: install, `prisma
generate`, typecheck, lint, unit tests, and the CLI's own tests. Note: the
app install step can't succeed until `@sahan-sac/auth-kit` is published to
npm (see below).

## Dependencies

`package.json` depends on `@sahan-sac/auth-kit` as `"^0.1.0"` — a normal npm
dependency, not a workspace package. **It is not published yet.** Until it
is, `pnpm install` in this repo (and the CI `app` job) will fail at
resolving that dependency; the CLI's own install and tests are unaffected.
There is no committed lockfile for the same reason — one is generated on
first install once the package is published.

## License

Apache License 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
