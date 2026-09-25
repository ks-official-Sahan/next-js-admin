import type { z } from "zod";

import type { Permission } from "@/lib/auth/permissions";
import type { PageSlug } from "@/lib/cache/tags";

// The shapes behind the CMS registry (design notes, section 8).
// Field descriptors are plain JSON, so a server component can hand them to the
// editor in the browser. Nothing here imports content or components.

interface FieldBase {
  /** Key of the value inside its parent object. */
  key: string;
  label: string;
  /** One sentence shown under the field. */
  help?: string;
}

export interface TextField extends FieldBase {
  kind: "text";
  maxLength?: number;
  placeholder?: string;
  /** Default true. An optional field may be left empty. */
  required?: boolean;
}

export interface LongTextField extends FieldBase {
  kind: "longtext";
  maxLength?: number;
  rows?: number;
  required?: boolean;
}

/** `{ label, href }`. The href is an internal path, an anchor, or an https, mailto or tel link. */
export interface LinkField extends FieldBase {
  kind: "link";
}

/** A list of plain strings that can be added to, removed from and reordered. */
export interface StringListField extends FieldBase {
  kind: "stringList";
  itemLabel: string;
  min?: number;
  max?: number;
  maxLength?: number;
  /** Long items get a multi-line box. */
  multiline?: boolean;
}

/** A list of objects, each described by `fields`. */
export interface ListField extends FieldBase {
  kind: "list";
  itemLabel: string;
  min?: number;
  max?: number;
  fields: FieldDescriptor[];
}

/** A nested object. */
export interface GroupField extends FieldBase {
  kind: "group";
  fields: FieldDescriptor[];
}

/** One value out of a fixed set, for example an icon key. */
export interface SelectField extends FieldBase {
  kind: "select";
  options: ReadonlyArray<{ value: string; label: string }>;
}

export type FieldDescriptor =
  | TextField
  | LongTextField
  | LinkField
  | StringListField
  | ListField
  | GroupField
  | SelectField;

export interface SectionDefinition<T = unknown> {
  page: PageSlug;
  /** Unique inside the page. Used in the database as `sectionSlug`. */
  key: string;
  label: string;
  description?: string;
  /** Validates a complete section. Unknown keys are dropped. */
  schema: z.ZodType<T>;
  /** Mirrors the shape of `schema`, key for key. */
  fields: FieldDescriptor[];
  /** Keys that live in the data but are not editable (fixed ids). */
  fixedKeys?: string[];
  /** What visitors see when nothing is published. Adapts `contents/*.ts`. */
  defaults: () => T;
  /** Public paths that show this section, revalidated on publish. */
  consumers: string[];
  editPermission: Permission;
  publishPermission: Permission;
}

/** The data type a section definition validates. */
export type SectionData<D> = D extends SectionDefinition<infer T> ? T : never;

/** Merged (defaults plus published) data of every section of one page. */
export type PageContentOf<Sections extends Record<string, SectionDefinition<unknown>>> = {
  [K in keyof Sections]: SectionData<Sections[K]>;
};
