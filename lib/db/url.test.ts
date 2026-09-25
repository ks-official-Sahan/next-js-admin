import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertAllowedSchema,
  deriveCliUrl,
  directHost,
  runtimeConnectionString,
  runtimeSchema,
  schemaFromUrl,
} from "./url";

// Synthetic credentials: this file never sees a real connection string.
const POOLED =
  "postgresql://user:pw@ep-aged-bush-a4vl0ehb-pooler.us-east-1.aws.neon.tech/mydb?sslmode=require&channel_binding=require&schema=public";

test("directHost removes -pooler from the first label only", () => {
  assert.equal(
    directHost("ep-aged-bush-a4vl0ehb-pooler.us-east-1.aws.neon.tech"),
    "ep-aged-bush-a4vl0ehb.us-east-1.aws.neon.tech"
  );
  assert.equal(directHost("localhost"), "localhost");
  assert.equal(directHost("db.pooler.example.com"), "db.pooler.example.com");
});

test("schemaFromUrl reads the parameter and defaults to public", () => {
  assert.equal(schemaFromUrl(POOLED), "public");
  assert.equal(schemaFromUrl("postgresql://u:p@h/db?schema=public_test"), "public_test");
  assert.equal(schemaFromUrl("postgresql://u:p@h/db"), "public");
  assert.equal(schemaFromUrl(undefined), "public");
  assert.equal(schemaFromUrl("not a url"), "public");
});

test("assertAllowedSchema only accepts this project's schemas", () => {
  assert.equal(assertAllowedSchema("public"), "public");
  assert.equal(assertAllowedSchema("public_test"), "public_test");
  for (const other of ["other_project", "", "PUBLIC", "public; drop schema x"]) {
    assert.throws(() => assertAllowedSchema(other), /Refusing to use database schema/);
  }
});

test("deriveCliUrl goes direct, drops channel_binding and pins the schema", () => {
  const url = new URL(deriveCliUrl({ DATABASE_URL: POOLED }) as string);
  assert.equal(url.hostname, "ep-aged-bush-a4vl0ehb.us-east-1.aws.neon.tech");
  assert.equal(url.searchParams.get("channel_binding"), null);
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(url.searchParams.get("schema"), "public");
  assert.equal(url.pathname, "/mydb");
});

test("deriveCliUrl adds the schema when the URL has none", () => {
  const url = new URL(
    deriveCliUrl({ DATABASE_URL: "postgresql://u:p@h.example.com/db?sslmode=require" }) as string
  );
  assert.equal(url.searchParams.get("schema"), "public");
});

test("deriveCliUrl prefers DIRECT_DATABASE_URL and keeps its host", () => {
  const url = new URL(
    deriveCliUrl({
      DATABASE_URL: POOLED,
      DIRECT_DATABASE_URL: "postgresql://u:p@direct-host.example.com/mydb?sslmode=require",
    }) as string
  );
  assert.equal(url.hostname, "direct-host.example.com");
  assert.equal(url.searchParams.get("schema"), "public");
});

test("deriveCliUrl returns undefined without a URL and throws on a bad one", () => {
  assert.equal(deriveCliUrl({}), undefined);
  assert.throws(() => deriveCliUrl({ DATABASE_URL: "not a url" }), /not a valid URL/);
});

test("deriveCliUrl refuses a schema that belongs to another project", () => {
  assert.throws(
    () => deriveCliUrl({ DATABASE_URL: "postgresql://u:p@h.example.com/db?schema=other_project" }),
    /Refusing to use database schema "other_project"/
  );
});

test("runtimeConnectionString stays pooled without schema or channel_binding", () => {
  const url = new URL(runtimeConnectionString({ DATABASE_URL: POOLED }) as string);
  assert.equal(url.hostname, "ep-aged-bush-a4vl0ehb-pooler.us-east-1.aws.neon.tech");
  assert.equal(url.searchParams.get("schema"), null);
  assert.equal(url.searchParams.get("channel_binding"), null);
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(runtimeConnectionString({}), undefined);
});

test("runtimeSchema reads the schema and enforces the allowlist", () => {
  assert.equal(runtimeSchema({ DATABASE_URL: POOLED }), "public");
  assert.equal(runtimeSchema({}), "public");
  assert.throws(() => runtimeSchema({ DATABASE_URL: "postgresql://u:p@h/db?schema=other_project" }));
});
