import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { blankItem, blankObject, blankValue, getIn, move, pathKey, setIn, validateValues } from "./field-model";
import { isSafeHref } from "./href";
import type { FieldDescriptor } from "./types";

const listField = {
  kind: "list",
  key: "points",
  label: "Points",
  itemLabel: "Point",
  max: 2,
  fields: [
    { kind: "text", key: "label", label: "Label" },
    { kind: "group", key: "meta", label: "Meta", fields: [{ kind: "text", key: "note", label: "Note", required: false }] },
  ],
} satisfies Extract<FieldDescriptor, { kind: "list" }>;

const fields: FieldDescriptor[] = [
  { kind: "text", key: "title", label: "Title", maxLength: 10 },
  { kind: "longtext", key: "body", label: "Body", required: false },
  { kind: "link", key: "cta", label: "Button" },
  { kind: "select", key: "icon", label: "Icon", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
  { kind: "stringList", key: "tags", label: "Tags", itemLabel: "Tag", min: 1, max: 2, maxLength: 5 },
  listField,
];

const valid = {
  title: "Hello",
  body: "",
  cta: { label: "Go", href: "/contact" },
  icon: "a",
  tags: ["one"],
  points: [{ label: "First", meta: { note: "" } }],
};

describe("isSafeHref", () => {
  it("allows paths, anchors, https, mailto and tel", () => {
    for (const value of ["/contact", "#faq", "https://example.com/a?b=1", "mailto:a@b.co", "tel:+94770000000"]) {
      assert.equal(isSafeHref(value), true, value);
    }
  });

  it("refuses scripts, protocol-relative links, spaces and control characters", () => {
    const control = String.fromCharCode(1);
    for (const value of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "/\\evil", "http://a.co", "", "a b", `/x${control}`]) {
      assert.equal(isSafeHref(value), false, JSON.stringify(value));
    }
  });
});

describe("blank values", () => {
  it("builds an empty value for every kind", () => {
    assert.equal(blankValue(fields[0]), "");
    assert.deepEqual(blankValue(fields[2]), { label: "", href: "" });
    assert.deepEqual(blankValue(fields[4]), []);
    assert.equal(blankValue(fields[3]), "a");
  });

  it("builds nested objects and list items", () => {
    assert.deepEqual(blankItem(listField), { label: "", meta: { note: "" } });
    assert.deepEqual(blankObject([fields[0]]), { title: "" });
  });
});

describe("paths", () => {
  it("sets a nested value without changing the original", () => {
    const next = setIn(valid, ["points", 0, "meta", "note"], "hi") as typeof valid;
    assert.equal(next.points[0].meta.note, "hi");
    assert.equal(valid.points[0].meta.note, "");
    assert.equal(next.title, "Hello");
  });

  it("creates missing containers", () => {
    const made = setIn(undefined, ["a", 1, "b"], 1);
    assert.equal(getIn(made, ["a", 1, "b"]), 1);
    assert.equal(getIn(made, ["a", 0]), undefined);
  });

  it("reads a nested value and tolerates a wrong shape", () => {
    assert.equal(getIn(valid, ["points", 0, "label"]), "First");
    assert.equal(getIn(valid, ["title", "x"]), undefined);
    assert.equal(getIn(null, ["a"]), undefined);
  });

  it("formats the server's error path", () => {
    assert.equal(pathKey(["points", 2, "label"]), "points[2].label");
    assert.equal(pathKey(["tags", 0]), "tags[0]");
    assert.equal(pathKey(["a", "b"]), "a.b");
  });
});

describe("move", () => {
  it("swaps and clamps", () => {
    assert.deepEqual(move([1, 2, 3], 0, 1), [2, 1, 3]);
    assert.deepEqual(move([1, 2, 3], 2, 1), [1, 3, 2]);
    assert.deepEqual(move([1, 2, 3], 0, -1), [1, 2, 3]);
    assert.deepEqual(move([1, 2, 3], 2, 3), [1, 2, 3]);
  });

  it("does not change the input", () => {
    const input = [1, 2, 3];
    move(input, 0, 2);
    assert.deepEqual(input, [1, 2, 3]);
  });
});

describe("validateValues", () => {
  it("accepts valid values", () => {
    assert.deepEqual(validateValues(fields, valid), {});
  });

  it("reports required, length and select errors by path", () => {
    const errors = validateValues(fields, { ...valid, title: "  ", icon: "z" });
    assert.equal(errors.title, "Required");
    assert.equal(errors.icon, "Choose an option");
    assert.match(validateValues(fields, { ...valid, title: "x".repeat(11) }).title, /at most 10/);
  });

  it("leaves an optional text empty", () => {
    assert.equal(validateValues(fields, { ...valid, body: "" }).body, undefined);
  });

  it("checks both parts of a link", () => {
    const errors = validateValues(fields, { ...valid, cta: { label: "", href: "javascript:x" } });
    assert.equal(errors["cta.label"], "Required");
    assert.match(errors["cta.href"], /path such as/);
  });

  it("checks list bounds and every item", () => {
    const errors = validateValues(fields, { ...valid, tags: ["ok", "toolong", ""], points: [] });
    assert.equal(errors.tags, "Use at most 2");
    assert.match(errors["tags[1]"], /at most 5/);
    assert.equal(errors["tags[2]"], "Required");
    assert.equal(validateValues(fields, { ...valid, tags: [] }).tags, "Add at least 1");
  });

  it("recurses into list items and groups", () => {
    const errors = validateValues(fields, {
      ...valid,
      points: [{ label: "", meta: { note: "x" } }, { label: "ok", meta: { note: "" } }, { label: "third", meta: { note: "" } }],
    });
    assert.equal(errors["points[0].label"], "Required");
    assert.equal(errors.points, "Use at most 2");
    assert.equal(errors["points[1].label"], undefined);
  });

  it("does not throw on a wrong shape", () => {
    assert.doesNotThrow(() => validateValues(fields, null));
    assert.doesNotThrow(() => validateValues(fields, { tags: "x", points: 3, cta: 1 }));
  });
});
