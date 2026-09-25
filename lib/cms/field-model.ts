import { isSafeHref } from "./href";
import type { FieldDescriptor } from "./types";

// What the section editor needs to know about values, kept out of the components
// so it is unit tested: an empty value for a new list item, reading and writing
// a nested value by path, and the checks that run while typing. The server still
// validates everything with the section's zod schema, which is the authority.

export type Values = Record<string, unknown>;

export function blankValue(field: FieldDescriptor): unknown {
  switch (field.kind) {
    case "text":
    case "longtext":
      return "";
    case "link":
      return { label: "", href: "" };
    case "stringList":
    case "list":
      return [];
    case "group":
      return blankObject(field.fields);
    case "select":
      return field.options[0]?.value ?? "";
  }
}

export function blankObject(fields: readonly FieldDescriptor[]): Values {
  return Object.fromEntries(fields.map((field) => [field.key, blankValue(field)]));
}

/** An empty item for a list of objects. */
export const blankItem = (field: Extract<FieldDescriptor, { kind: "list" }>): Values => blankObject(field.fields);

const isObject = (value: unknown): value is Values => typeof value === "object" && value !== null && !Array.isArray(value);

/** Immutable set of `path` (segments) in `root`. */
export function setIn(root: unknown, path: ReadonlyArray<string | number>, value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const list = Array.isArray(root) ? [...root] : [];
    list[head] = setIn(list[head], rest, value);
    return list;
  }
  const object = isObject(root) ? { ...root } : {};
  object[head] = setIn(object[head], rest, value);
  return object;
}

export function getIn(root: unknown, path: ReadonlyArray<string | number>): unknown {
  let current = root;
  for (const part of path) {
    if (typeof part === "number") current = Array.isArray(current) ? current[part] : undefined;
    else current = isObject(current) ? current[part] : undefined;
  }
  return current;
}

/** The dotted error path the server uses, `points[2].label`, from path segments. */
export function pathKey(path: ReadonlyArray<string | number>): string {
  return path.reduce<string>(
    (out, part) => (typeof part === "number" ? `${out}[${part}]` : out ? `${out}.${part}` : part),
    ""
  );
}

export const move = <T>(items: readonly T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export type Errors = Record<string, string>;

const HREF_HELP = "Use a path such as /contact, an anchor, or an https, mailto or tel link";

/** Checks that need no schema: required, length, list bounds, link safety. */
export function validateValues(
  fields: readonly FieldDescriptor[],
  values: unknown,
  base: ReadonlyArray<string | number> = []
): Errors {
  const errors: Errors = {};
  const record = isObject(values) ? values : {};

  for (const field of fields) {
    const path = [...base, field.key];
    const key = pathKey(path);
    const value = record[field.key];

    switch (field.kind) {
      case "text":
      case "longtext": {
        const text = typeof value === "string" ? value.trim() : "";
        if (text.length === 0 && field.required !== false) errors[key] = "Required";
        else if (field.maxLength && text.length > field.maxLength) errors[key] = `Use at most ${field.maxLength} characters`;
        break;
      }
      case "select":
        if (typeof value !== "string" || !field.options.some((option) => option.value === value)) {
          errors[key] = "Choose an option";
        }
        break;
      case "link": {
        const link = isObject(value) ? value : {};
        const label = typeof link.label === "string" ? link.label.trim() : "";
        const href = typeof link.href === "string" ? link.href.trim() : "";
        if (label.length === 0) errors[`${key}.label`] = "Required";
        else if (label.length > 60) errors[`${key}.label`] = "Use at most 60 characters";
        if (href.length === 0) errors[`${key}.href`] = "Required";
        else if (!isSafeHref(href)) errors[`${key}.href`] = HREF_HELP;
        break;
      }
      case "stringList": {
        const list = Array.isArray(value) ? value : [];
        if (field.min !== undefined && list.length < field.min) errors[key] = `Add at least ${field.min}`;
        if (field.max !== undefined && list.length > field.max) errors[key] = `Use at most ${field.max}`;
        list.forEach((item, index) => {
          const text = typeof item === "string" ? item.trim() : "";
          if (text.length === 0) errors[`${key}[${index}]`] = "Required";
          else if (field.maxLength && text.length > field.maxLength) {
            errors[`${key}[${index}]`] = `Use at most ${field.maxLength} characters`;
          }
        });
        break;
      }
      case "list": {
        const list = Array.isArray(value) ? value : [];
        if (field.min !== undefined && list.length < field.min) errors[key] = `Add at least ${field.min}`;
        if (field.max !== undefined && list.length > field.max) errors[key] = `Use at most ${field.max}`;
        list.forEach((item, index) => Object.assign(errors, validateValues(field.fields, item, [...path, index])));
        break;
      }
      case "group":
        Object.assign(errors, validateValues(field.fields, value, path));
        break;
    }
  }
  return errors;
}
