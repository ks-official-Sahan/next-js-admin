// Connection-string helpers shared by the Prisma CLI config and the runtime
// client. Pure on purpose (no server-only import) so prisma.config.ts can load
// it. Design notes: section 7.

export const DEFAULT_SCHEMA = "public";

/**
 * Schemas this project may target. Set both via the `schema` query parameter
 * on DATABASE_URL if you share one Postgres instance across projects.
 * `public_test` is for database tests only.
 */
export const ALLOWED_SCHEMAS = [DEFAULT_SCHEMA, "public_test"] as const;

type Env = Record<string, string | undefined>;

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Schema named by the `schema` query parameter, `public` when absent. */
export function schemaFromUrl(url: string | undefined): string {
  if (!url) return DEFAULT_SCHEMA;
  return parse(url)?.searchParams.get("schema") || DEFAULT_SCHEMA;
}

/** Throws unless the schema is one this project owns. Returns the schema. */
export function assertAllowedSchema(schema: string): string {
  if (!(ALLOWED_SCHEMAS as readonly string[]).includes(schema)) {
    throw new Error(
      `Refusing to use database schema "${schema}". This project may only use: ${ALLOWED_SCHEMAS.join(", ")}.`
    );
  }
  return schema;
}

/** `ep-x-pooler.region.aws.neon.tech` becomes `ep-x.region.aws.neon.tech`. */
export function directHost(host: string): string {
  const [first, ...rest] = host.split(".");
  return [first.replace(/-pooler$/, ""), ...rest].join(".");
}

/**
 * URL for the Prisma CLI (`generate`, `db push`). DDL needs a direct
 * connection, and the schema engine does not accept `channel_binding`. The
 * schema is always written explicitly and checked against the allowlist, so a
 * stray value can never point the CLI at another project's schema.
 */
export function deriveCliUrl(env: Env): string | undefined {
  const source = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
  if (!source) return undefined;

  const url = parse(source);
  if (!url) throw new Error("The database URL is not a valid URL");

  if (!env.DIRECT_DATABASE_URL) url.hostname = directHost(url.hostname);
  url.searchParams.delete("channel_binding");

  const schema = assertAllowedSchema(
    url.searchParams.get("schema") || schemaFromUrl(env.DATABASE_URL)
  );
  url.searchParams.set("schema", schema);
  return url.toString();
}

/**
 * Pooled URL for the runtime driver. The schema travels through the adapter
 * option instead of the URL, and `channel_binding` is not supported over the
 * WebSocket driver, so both are removed.
 */
export function runtimeConnectionString(env: Env): string | undefined {
  if (!env.DATABASE_URL) return undefined;
  const url = parse(env.DATABASE_URL);
  if (!url) throw new Error("DATABASE_URL is not a valid URL");
  url.searchParams.delete("schema");
  url.searchParams.delete("channel_binding");
  return url.toString();
}

/** Schema for the runtime adapter, checked against the allowlist. */
export function runtimeSchema(env: Env): string {
  return assertAllowedSchema(schemaFromUrl(env.DATABASE_URL));
}
