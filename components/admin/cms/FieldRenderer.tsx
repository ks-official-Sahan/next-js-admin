"use client";

import type { ReactNode } from "react";

import { blankItem, getIn, move, pathKey, setIn, type Errors, type Values } from "@/lib/cms/field-model";
import type { FieldDescriptor } from "@/lib/cms/types";
import { cn } from "@/lib/utils";

import { buttonVariants, fieldClass, textareaClass } from "../ui/styles";

// Draws the form for a list of field descriptors. The section editor owns the
// values; this only reads them and reports changes by path. Every input has a
// label, a hint and an error tied to it with aria-describedby, and every list
// action has its own accessible name, so the form works with a keyboard and a
// screen reader at 390 px.

type Path = ReadonlyArray<string | number>;

interface Shared {
  root: unknown;
  errors: Errors;
  disabled: boolean;
  idPrefix: string;
  onChange: (next: unknown) => void;
}

/** The DOM id of the input for an error key such as `points[2].label`. */
export const inputId = (prefix: string, key: string) => `${prefix}-${key.replace(/[.[\]]+/g, "-").replace(/-$/, "")}`;

function Frame({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="mt-1.5">{children(describedBy)}</div>
      {help ? (
        <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Counter({ value, max }: { value: string; max?: number }) {
  if (!max) return null;
  return (
    <p
      className={cn("mt-1 text-right text-xs", value.length > max ? "text-destructive" : "text-muted-foreground")}
      aria-hidden="true"
    >
      {value.length}/{max}
    </p>
  );
}

export default function FieldRenderer({
  fields,
  path = [],
  ...shared
}: { fields: readonly FieldDescriptor[]; path?: Path } & Shared) {
  return (
    <div className="space-y-5">
      {fields.map((field) => (
        <One key={field.key} field={field} path={[...path, field.key]} {...shared} />
      ))}
    </div>
  );
}

function One({ field, path, ...shared }: { field: FieldDescriptor; path: Path } & Shared) {
  const { root, errors, disabled, idPrefix, onChange } = shared;
  const key = pathKey(path);
  const id = inputId(idPrefix, key);
  const value = getIn(root, path);
  const set = (next: unknown, at: Path = path) => onChange(setIn(root, at, next));

  switch (field.kind) {
    case "text": {
      const text = typeof value === "string" ? value : "";
      return (
        <Frame id={id} label={field.label} help={field.help} error={errors[key]}>
          {(describedBy) => (
            <>
              <input
                id={id}
                type="text"
                value={text}
                disabled={disabled}
                placeholder={field.placeholder}
                aria-invalid={errors[key] ? true : undefined}
                aria-describedby={describedBy}
                aria-required={field.required !== false || undefined}
                className={fieldClass}
                onChange={(event) => set(event.target.value)}
              />
              <Counter value={text} max={field.maxLength} />
            </>
          )}
        </Frame>
      );
    }

    case "longtext": {
      const text = typeof value === "string" ? value : "";
      return (
        <Frame id={id} label={field.label} help={field.help} error={errors[key]}>
          {(describedBy) => (
            <>
              <textarea
                id={id}
                value={text}
                rows={field.rows ?? 4}
                disabled={disabled}
                aria-invalid={errors[key] ? true : undefined}
                aria-describedby={describedBy}
                aria-required={field.required !== false || undefined}
                className={textareaClass}
                onChange={(event) => set(event.target.value)}
              />
              <Counter value={text} max={field.maxLength} />
            </>
          )}
        </Frame>
      );
    }

    case "select":
      return (
        <Frame id={id} label={field.label} help={field.help} error={errors[key]}>
          {(describedBy) => (
            <select
              id={id}
              value={typeof value === "string" ? value : ""}
              disabled={disabled}
              aria-invalid={errors[key] ? true : undefined}
              aria-describedby={describedBy}
              className={fieldClass}
              onChange={(event) => set(event.target.value)}
            >
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Frame>
      );

    case "link": {
      const link = (value ?? {}) as { label?: string; href?: string };
      const labelError = errors[`${key}.label`];
      const hrefError = errors[`${key}.href`];
      return (
        <fieldset className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{field.label}</legend>
          {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
          <Frame id={`${id}-label`} label="Text on the link" error={labelError}>
            {(describedBy) => (
              <input
                id={`${id}-label`}
                type="text"
                value={link.label ?? ""}
                disabled={disabled}
                aria-invalid={labelError ? true : undefined}
                aria-describedby={describedBy}
                aria-required
                className={fieldClass}
                onChange={(event) => set(event.target.value, [...path, "label"])}
              />
            )}
          </Frame>
          <Frame
            id={`${id}-href`}
            label="Where it goes"
            help="A path such as /contact, an anchor, or an https, mailto or tel link."
            error={hrefError}
          >
            {(describedBy) => (
              <input
                id={`${id}-href`}
                type="text"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={link.href ?? ""}
                disabled={disabled}
                aria-invalid={hrefError ? true : undefined}
                aria-describedby={describedBy}
                aria-required
                className={fieldClass}
                onChange={(event) => set(event.target.value, [...path, "href"])}
              />
            )}
          </Frame>
        </fieldset>
      );
    }

    case "group":
      return (
        <fieldset className="space-y-4 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{field.label}</legend>
          {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
          <FieldRenderer fields={field.fields} path={path} {...shared} />
        </fieldset>
      );

    case "stringList": {
      const list = Array.isArray(value) ? (value as string[]) : [];
      const atMax = field.max !== undefined && list.length >= field.max;
      const atMin = field.min !== undefined && list.length <= field.min;
      return (
        <fieldset
          className="space-y-3 rounded-md border border-border p-3"
          aria-describedby={errors[key] ? `${id}-error` : undefined}
        >
          <legend className="px-1 text-sm font-medium">{field.label}</legend>
          {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
          {list.length === 0 ? <p className="text-xs text-muted-foreground">Nothing here yet.</p> : null}
          <ol className="space-y-3">
            {list.map((item, index) => {
              const itemKey = `${key}[${index}]`;
              const itemId = inputId(idPrefix, itemKey);
              const itemError = errors[itemKey];
              const name = `${field.itemLabel} ${index + 1}`;
              const shared = {
                id: itemId,
                value: item,
                disabled,
                "aria-invalid": itemError ? true : undefined,
                "aria-describedby": itemError ? `${itemId}-error` : undefined,
                "aria-required": true,
              } as const;
              return (
                <li key={index} className="space-y-1.5">
                  <label htmlFor={itemId} className="text-xs font-medium text-muted-foreground">
                    {name}
                  </label>
                  {field.multiline ? (
                    <textarea
                      {...shared}
                      rows={3}
                      className={textareaClass}
                      onChange={(event) => set(event.target.value, [...path, index])}
                    />
                  ) : (
                    <input
                      {...shared}
                      type="text"
                      className={fieldClass}
                      onChange={(event) => set(event.target.value, [...path, index])}
                    />
                  )}
                  {itemError ? (
                    <p id={`${itemId}-error`} role="alert" className="text-xs text-destructive">
                      {itemError}
                    </p>
                  ) : null}
                  <ItemButtons
                    name={name}
                    index={index}
                    count={list.length}
                    disabled={disabled}
                    canRemove={!atMin}
                    onMove={(to) => set(move(list, index, to))}
                    onRemove={() => set(list.filter((_, at) => at !== index))}
                  />
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            disabled={disabled || atMax}
            className={buttonVariants.small}
            onClick={() => set([...list, ""])}
          >
            Add {field.itemLabel.toLowerCase()}
          </button>
          {errors[key] ? (
            <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
              {errors[key]}
            </p>
          ) : null}
        </fieldset>
      );
    }

    case "list": {
      const list = Array.isArray(value) ? (value as Values[]) : [];
      const atMax = field.max !== undefined && list.length >= field.max;
      const atMin = field.min !== undefined && list.length <= field.min;
      return (
        <fieldset
          className="space-y-3 rounded-md border border-border p-3"
          aria-describedby={errors[key] ? `${id}-error` : undefined}
        >
          <legend className="px-1 text-sm font-medium">{field.label}</legend>
          {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
          {list.length === 0 ? <p className="text-xs text-muted-foreground">Nothing here yet.</p> : null}
          <ol className="space-y-4">
            {list.map((_, index) => {
              const name = `${field.itemLabel} ${index + 1}`;
              return (
                <li key={index}>
                  <fieldset className="space-y-4 rounded-md border border-dashed border-border p-3">
                    <legend className="px-1 text-xs font-medium text-muted-foreground">{name}</legend>
                    <FieldRenderer fields={field.fields} path={[...path, index]} {...shared} />
                    <ItemButtons
                      name={name}
                      index={index}
                      count={list.length}
                      disabled={disabled}
                      canRemove={!atMin}
                      onMove={(to) => set(move(list, index, to))}
                      onRemove={() => set(list.filter((_, at) => at !== index))}
                    />
                  </fieldset>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            disabled={disabled || atMax}
            className={buttonVariants.small}
            onClick={() => set([...list, blankItem(field)])}
          >
            Add {field.itemLabel.toLowerCase()}
          </button>
          {errors[key] ? (
            <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
              {errors[key]}
            </p>
          ) : null}
        </fieldset>
      );
    }
  }
}

function ItemButtons({
  name,
  index,
  count,
  disabled,
  canRemove,
  onMove,
  onRemove,
}: {
  name: string;
  index: number;
  count: number;
  disabled: boolean;
  canRemove: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled || index === 0}
        aria-label={`Move ${name} up`}
        className={buttonVariants.small}
        onClick={() => onMove(index - 1)}
      >
        Up
      </button>
      <button
        type="button"
        disabled={disabled || index === count - 1}
        aria-label={`Move ${name} down`}
        className={buttonVariants.small}
        onClick={() => onMove(index + 1)}
      >
        Down
      </button>
      <button
        type="button"
        disabled={disabled || !canRemove}
        aria-label={`Remove ${name}`}
        className={buttonVariants.smallDanger}
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}
