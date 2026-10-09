# create-admin

Scaffold a new project from [admin-template](https://github.com/ks-official-Sahan/next-js-admin): a Next.js admin panel starter with auth, RBAC, a CMS, a blog, media, leads/CRM and a chatbot.

## Usage

```sh
npm create @sahan-sac/admin@latest my-app
```

npm maps `npm create @sahan-sac/admin` to the `@sahan-sac/create-admin` package (this one) and runs its `create-admin` binary. You can also run it directly:

```sh
npx @sahan-sac/create-admin my-app
```

If you omit the directory, the CLI asks for one.

## Options

```
Usage: create-admin [dir] [options]

Arguments:
  dir                       Directory to create the project in (asked if omitted)

Options:
  --ref <git-ref>           Template tag/branch/commit to use (default: v<cli-version>)
  --pm <pnpm|npm|yarn|bun>  Package manager to install with (default: auto-detected)
  --auth <next-auth|better-auth>  Auth engine (asked if omitted; default: next-auth)
  --orm <prisma|drizzle>    ORM for the data layer (asked if omitted; default: prisma)
  --no-install              Skip installing dependencies
  --no-git                  Skip `git init` and the initial commit
  -h, --help                Show help
  -v, --version             Print the CLI version
```

A CLI version always scaffolds the matching template tag: `create-admin@0.1.0` downloads `v0.1.0` of the template unless you pass `--ref`.

## What it does

1. Refuses to run if `dir` already exists and is not empty.
2. Downloads `github:ks-official-Sahan/next-js-admin#<ref>` with [giget](https://github.com/unjs/giget).
3. Removes the scaffold's own `cli/` folder and `.github/workflows/release-cli.yml` — those belong to the template repo, not to your project.
4. Applies the chosen auth engine and ORM from the template's `variants/variants.json` (`lib/variants.mjs`): copies the overlay files, deletes what the choice does not use, edits `package.json` and `.env.example`, then removes `variants/`. Without a terminal, missing `--auth`/`--orm` take the defaults. A template version older than the variants only works with the defaults.
5. Sets `package.json`'s `name` to a valid npm package name derived from `dir`.
6. Copies `.env.example` to `.env.local`, filling every `*_SECRET`/`*_SIGNING_KEY` variable with a fresh `crypto.randomBytes(32)` value and leaving provider keys (database, email, AI, Cloudinary, ...) blank for you to fill in.
7. Optionally installs dependencies and initializes a git repository with one commit.
8. Prints next steps (set `DATABASE_URL`, push the schema, seed the owner account, start the dev server).

## Development

Pure helpers (argument parsing, npm name normalization, `.env.local` rendering, package-manager detection) live in `lib/`, each with `node:test` tests in `test/`:

```sh
node --test test/*.test.mjs
```

`index.mjs` is the thin orchestration layer (filesystem, giget, spawning `install`/`git`) and is exercised end-to-end by using the CLI itself, not unit tested directly.
