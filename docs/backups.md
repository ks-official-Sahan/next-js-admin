# Database backups

The app backs up its own schema (from `DATABASE_URL`, default `public`) to an
S3-compatible bucket kept only for backups. Code: `lib/backup/`.

## What a backup is

- One consistent snapshot: every table is read inside a single read-only
  `REPEATABLE READ` transaction, so a change that touches two tables is in
  both or in neither.
- One object per table, `<prefix>/<id>/<table>.ndjson.gz.enc`: one
  `row_to_json()` line per row, gzipped, then sealed with AES-256-GCM. The
  seal binds each object to its backup and table, so an object that is
  changed, renamed or copied into another backup fails to open.
- `manifest.json`, written last: table names, column types, row counts and a
  SHA-256 per table. A backup without a manifest never finished; it is
  ignored and removed after a day.
- Left out on purpose: `user_sessions`, `mfa_challenges` and `auth_tokens`
  (expired or single-use by the time anyone restores). Add more with
  `BACKUP_EXCLUDE_TABLES`.

## When it runs

- Every night at 02:20 UTC (`vercel.json`, `/api/cron/backup`, guarded by
  `CRON_SECRET`).
- On demand: Admin > Backups > Back up now (needs the `manageSettings`
  permission; audited as `backup.created` or `backup.failed`), or
  `pnpm db:backup run`.
- One run at a time (a Redis lock, freed automatically after 6 minutes).

Retention keeps the newest `BACKUP_RETENTION_DAILY` (14), plus the newest
backup of each of the last `BACKUP_RETENTION_WEEKLY` (8) ISO weeks and
`BACKUP_RETENTION_MONTHLY` (6) months. The newest backup is never deleted.

## Setup

Create a bucket used for nothing else (for example `app-backups` in Neon
Object Storage), with a key that can list, read, write and delete in it.

```
BACKUP_S3_ENDPOINT=https://<endpoint>          # no bucket in it
BACKUP_S3_BUCKET=app-backups
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
BACKUP_S3_REGION=us-east-1                     # optional
BACKUP_S3_PREFIX=db                            # optional
BACKUP_ENCRYPTION_KEY=...                      # openssl rand -base64 32
```

Store `BACKUP_ENCRYPTION_KEY` somewhere other than the bucket and the
deployment too (a password manager). Without it no backup can be read.

**Rotating the key:** set the new key as `BACKUP_ENCRYPTION_KEY` and move the
old one into `BACKUP_ENCRYPTION_KEY_PREVIOUS` (comma-separated) until every
backup made with it has aged out.

## Restoring

Restores run from the command line only, and only into a schema this project
owns (`lib/db/url.ts` ALLOWED_SCHEMAS, e.g. `public` or `public_test`).

```
pnpm db:backup list
pnpm db:backup verify <id>                     # download, decrypt, check; writes nothing
pnpm db:backup restore <id> --schema public_test
```

`restore` checks every object (seal, checksum, row count) before it touches
the database, then inserts everything in one transaction: parents before
children, sequences reset, every table re-counted. Any failure rolls it all
back. By default it refuses tables that already have rows; `--replace`
truncates them first.

To replace live data:

1. Create a Neon branch of the current database (instant), so today's state
   stays recoverable whatever happens.
2. Restore into `public_test` and check it.
3. `pnpm db:backup restore <id> --schema public --replace --yes-replace-live`
4. Clear the caches (Admin > Settings > Clear system cache).

If the schema changed since the backup, restore stops on columns the target
no longer has; `--allow-column-drift` drops their values instead.

## Limits

- Each table is compressed in memory before upload, up to 256 MB of rows per
  table; past that the backup stops with a clear error (it needs multipart
  uploads first).
- Neon keeps its own point-in-time history as well (the project's history
  retention). These backups add copies outside Neon, kept for months.
