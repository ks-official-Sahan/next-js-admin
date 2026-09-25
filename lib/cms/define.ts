import type { z } from "zod";

import type { FieldDescriptor, SectionDefinition } from "./types";

// Helpers that keep a section definition short. Only this file and types.ts are
// shared by every page module in lib/cms/pages.

type Input<T> = Omit<SectionDefinition<T>, "editPermission" | "publishPermission"> & {
  /** Default `editPages`. Site-wide sections use `manageSettings`. */
  editPermission?: SectionDefinition<T>["editPermission"];
  /** Default `publishPages`. */
  publishPermission?: SectionDefinition<T>["publishPermission"];
};

export function defineSection<S extends z.ZodType>(
  input: Input<z.output<S>> & { schema: S }
): SectionDefinition<z.output<S>> {
  return {
    ...input,
    editPermission: input.editPermission ?? "editPages",
    publishPermission: input.publishPermission ?? "publishPages",
  };
}

// Descriptor builders. `required` defaults to true, so an optional field says so.

export const text = (
  key: string,
  label: string,
  extra: { help?: string; maxLength?: number; placeholder?: string; required?: boolean } = {}
): FieldDescriptor => ({ kind: "text", key, label, ...extra });

export const longtext = (
  key: string,
  label: string,
  extra: { help?: string; maxLength?: number; rows?: number; required?: boolean } = {}
): FieldDescriptor => ({ kind: "longtext", key, label, ...extra });

export const link = (key: string, label: string, extra: { help?: string } = {}): FieldDescriptor => ({
  kind: "link",
  key,
  label,
  ...extra,
});

export const stringList = (
  key: string,
  label: string,
  extra: { itemLabel: string; min?: number; max?: number; maxLength?: number; multiline?: boolean; help?: string }
): FieldDescriptor => ({ kind: "stringList", key, label, ...extra });

export const list = (
  key: string,
  label: string,
  extra: { itemLabel: string; fields: FieldDescriptor[]; min?: number; max?: number; help?: string }
): FieldDescriptor => ({ kind: "list", key, label, ...extra });

export const group = (
  key: string,
  label: string,
  fields: FieldDescriptor[],
  extra: { help?: string } = {}
): FieldDescriptor => ({ kind: "group", key, label, fields, ...extra });

export const select = (
  key: string,
  label: string,
  options: ReadonlyArray<{ value: string; label: string }>,
  extra: { help?: string } = {}
): FieldDescriptor => ({ kind: "select", key, label, options, ...extra });
