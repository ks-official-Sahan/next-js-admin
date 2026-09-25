import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blankItem, blankValue, pathKey, setIn, validateValues } from "./field-model";
import { allSections } from "./registry";
import type { FieldDescriptor } from "./types";

// The editor and the server must agree. Whatever the server rejects after the
// person adds a blank item, the form must already have marked, so nobody is left
// with a toast and no field to fix (a hidden required key is the usual cause).
// Importers: none, it runs in the `lib/**/*.test.ts` suite.

type Path = Array<string | number>;

interface Target {
  path: Path;
  field: Extract<FieldDescriptor, { kind: "list" | "stringList" }>;
}

function addable(fields: readonly FieldDescriptor[], base: Path, values: unknown): Target[] {
  const out: Target[] = [];
  for (const field of fields) {
    const path = [...base, field.key];
    const value = (values as Record<string, unknown> | undefined)?.[field.key];
    if (field.kind === "group") out.push(...addable(field.fields, path, value));
    if (field.kind === "list" || field.kind === "stringList") {
      const length = Array.isArray(value) ? value.length : 0;
      if (field.max === undefined || length < field.max) out.push({ path, field });
      if (field.kind === "list" && Array.isArray(value)) {
        value.forEach((item, index) => out.push(...addable(field.fields, [...path, index], item)));
      }
    }
  }
  return out;
}

describe("editor and server agree on a newly added item", () => {
  for (const section of allSections()) {
    it(`${section.page}.${section.key}`, () => {
      const defaults = section.defaults();
      for (const { path, field } of addable(section.fields, [], defaults)) {
        const current = path.reduce<unknown>((value, part) => (value as Record<string | number, unknown>)?.[part], defaults);
        const blank = field.kind === "list" ? blankItem(field) : blankValue({ kind: "text", key: "x", label: "x" });
        const next = setIn(defaults, path, [...(Array.isArray(current) ? current : []), blank]);

        const server = section.schema.safeParse(next);
        if (server.success) continue;
        const client = validateValues(section.fields, next);
        for (const issue of server.error.issues) {
          const key = pathKey(issue.path as Path);
          const marked = Object.keys(client).some(
            (clientKey) => clientKey === key || clientKey.startsWith(`${key}.`) || clientKey.startsWith(`${key}[`)
          );
          assert.ok(marked, `${pathKey(path)}: server rejects "${key}" (${issue.message}) but the form does not mark it`);
        }
      }
    });
  }
});
