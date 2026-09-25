import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { allSections, CMS_PAGES, sectionsOf } from "./registry";
import type { FieldDescriptor } from "./types";

// Registry completeness (design notes, section 8): every value of a
// section can be edited, no editor field points at nothing, and the code defaults
// are themselves valid content, so an empty database renders today's site.

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Compares the keys of a value with the descriptors that edit it. Returns problems. */
function checkShape(value: unknown, fields: FieldDescriptor[], fixed: Set<string>, path: string): string[] {
  if (!isObject(value)) return [`${path || "(root)"} is not an object`];
  const problems: string[] = [];
  const described = new Set(fields.map((field) => field.key));

  for (const key of Object.keys(value)) {
    if (!described.has(key) && !fixed.has(path ? `${path}.${key}` : key)) {
      problems.push(`${path ? `${path}.` : ""}${key} has no editor field`);
    }
  }
  for (const field of fields) {
    const here = path ? `${path}.${field.key}` : field.key;
    const item = value[field.key];
    if (item === undefined) {
      // Only optional text may be absent from the defaults.
      const optional = (field.kind === "text" || field.kind === "longtext") && field.required === false;
      if (!optional) problems.push(`${here} has an editor field but no default`);
      continue;
    }
    switch (field.kind) {
      case "text":
      case "longtext":
      case "select":
        if (typeof item !== "string") problems.push(`${here} should be a string`);
        break;
      case "link":
        if (!isObject(item) || typeof item.label !== "string" || typeof item.href !== "string") {
          problems.push(`${here} should be { label, href }`);
        }
        break;
      case "stringList":
        if (!Array.isArray(item) || item.some((entry) => typeof entry !== "string")) {
          problems.push(`${here} should be a list of strings`);
        }
        break;
      case "group":
        problems.push(...checkShape(item, field.fields, fixed, here));
        break;
      case "list":
        if (!Array.isArray(item)) problems.push(`${here} should be a list`);
        else item.forEach((entry, index) => problems.push(...checkShape(entry, field.fields, fixed, `${here}[${index}]`)));
        break;
    }
  }
  return problems;
}

describe("cms registry", () => {
  const sections = allSections();

  it("has sections for every page", () => {
    for (const page of CMS_PAGES) assert.ok(Object.keys(sectionsOf(page)).length > 0, `${page} has no sections`);
  });

  it("keys sections consistently", () => {
    const seen = new Set<string>();
    for (const page of CMS_PAGES) {
      for (const [key, section] of Object.entries(sectionsOf(page))) {
        assert.equal(section.page, page, `${page}.${key}: page mismatch`);
        assert.equal(section.key, key, `${page}.${key}: key mismatch`);
        assert.match(key, /^[a-zA-Z][a-zA-Z0-9]*$/, `${page}.${key}: key shape`);
        assert.ok(!seen.has(`${page}.${key}`), `${page}.${key}: duplicate`);
        seen.add(`${page}.${key}`);
      }
    }
  });

  for (const section of sections) {
    const id = `${section.page}.${section.key}`;

    describe(id, () => {
      it("has valid defaults that survive a parse unchanged", () => {
        const defaults = section.defaults();
        const parsed = section.schema.safeParse(defaults);
        assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3)));
        assert.deepEqual(parsed.data, defaults);
      });

      it("has an editor field for every value and no field without a value", () => {
        const fixed = new Set(section.fixedKeys ?? []);
        assert.deepEqual(checkShape(section.defaults(), section.fields, fixed, ""), []);
      });

      it("lists consumers as public paths", () => {
        assert.ok(section.consumers.length > 0, "no consumers");
        for (const path of section.consumers) assert.match(path, /^\/[a-z0-9/-]*$/, `bad path ${path}`);
      });

      it("has a label and permissions", () => {
        assert.ok(section.label.length > 0);
        assert.ok(section.editPermission && section.publishPermission);
      });

      it("rejects an obviously wrong value", () => {
        assert.equal(section.schema.safeParse(null).success, false);
        assert.equal(section.schema.safeParse("text").success, false);
      });
    });
  }
});
