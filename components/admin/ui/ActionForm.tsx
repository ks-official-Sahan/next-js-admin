"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { idleState, type ActionState } from "@/lib/actions/state";
import { toast } from "@/lib/admin/toast";
import { cn } from "@/lib/utils";

import { buttonVariants, fieldClass, textareaClass, type ButtonVariant } from "./styles";

// One wrapper for every admin form that calls a Server Function. It shows the
// result as a toast and under the form, puts field messages next to their
// inputs, and keeps what was typed when the action fails (React clears an
// uncontrolled form after every action, which loses an email over one typo).

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

function restoreValues(form: HTMLFormElement | null, values: FormData) {
  for (const element of Array.from(form?.elements ?? [])) {
    if (element instanceof HTMLInputElement) {
      if (!element.name || ["password", "hidden", "file"].includes(element.type)) continue;
      if (element.type === "checkbox" || element.type === "radio") {
        element.checked = values.getAll(element.name).includes(element.value);
        continue;
      }
    } else if (!(element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) || !element.name) {
      continue;
    }
    const value = values.get((element as HTMLInputElement).name);
    if (typeof value === "string") (element as HTMLInputElement).value = value;
  }
}

const FormState = createContext<ActionState>(idleState);

/** The result of the surrounding ActionForm, for parts that depend on it. */
export const useActionResult = () => useContext(FormState);

export default function ActionForm({
  action,
  children,
  className,
  showMessage = true,
  onResult,
}: {
  /** Pass the Server Function itself, so the form still posts without JavaScript. */
  action: Action;
  children: ReactNode;
  className?: string;
  showMessage?: boolean;
  /** Called with each new result, for a parent that reacts to it (a second step). */
  onResult?: (state: ActionState) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);

  const [state, formAction] = useActionState<ActionState, FormData>(action, idleState);

  useEffect(() => {
    if (state.message) toast.success(state.message);
    if (state.error) toast.error(state.error);
    if (state !== idleState) onResult?.(state);

    // React clears the form once the action ends. After a failure, put the typed
    // values back (never a password or a hidden field).
    if (state.ok || !state.error || !form.current || !submitted.current) return;
    const values = submitted.current;
    const timer = setTimeout(() => restoreValues(form.current, values), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per result, not per parent render
  }, [state]);

  return (
    <FormState.Provider value={state}>
      <form
        ref={form}
        action={formAction}
        // Keep what was typed: React clears the form when the action ends.
        onSubmit={(event) => {
          submitted.current = new FormData(event.currentTarget);
        }}
        className={className}
        noValidate
      >
        {children}
        {showMessage && state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </form>
    </FormState.Provider>
  );
}

interface SubmitButtonProps {
  children: ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
  /** Distinguishes which button submitted a form with more than one action (e.g. bulk publish/unpublish/archive). */
  name?: string;
  value?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function SubmitButton({ children, pendingLabel, variant = "primary", className, name, value, onClick }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      onClick={onClick}
      className={cn(buttonVariants[variant], className)}
    >
      {pending ? (pendingLabel ?? "Working...") : children}
    </button>
  );
}

/**
 * A SubmitButton that asks for confirmation before the action runs — for
 * delete and other irreversible actions (never a silent one-click). Uses the
 * browser's native confirm dialog: keyboard operable and announced by screen
 * readers without a bespoke dialog component, same pattern already used for
 * the CMS section editor's discard/restore actions (components/admin/cms/SectionEditor.tsx).
 */
export function ConfirmSubmitButton({ confirmMessage, onClick, ...props }: SubmitButtonProps & { confirmMessage: string }) {
  return (
    <SubmitButton
      {...props}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
  defaultValue?: string;
  maxLength?: number;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "email";
  autoFocus?: boolean;
  /** Renders a multi-line box. */
  multiline?: boolean;
  className?: string;
}

/** Label, input and the field message from the surrounding ActionForm. */
export function Field({ label, name, hint, multiline, className, ...input }: FieldProps) {
  const state = useActionResult();
  const message = state.fieldErrors?.[name];
  const id = `f-${name}`;
  const describedBy = [hint ? `${id}-hint` : null, message ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          name={name}
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy}
          className={cn(textareaClass, "mt-1.5")}
          defaultValue={input.defaultValue}
          maxLength={input.maxLength}
          placeholder={input.placeholder}
        />
      ) : (
        <input
          id={id}
          name={name}
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy}
          className={cn(fieldClass, "mt-1.5")}
          {...input}
        />
      )}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
