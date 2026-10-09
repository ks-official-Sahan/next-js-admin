"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, Wand2 } from "lucide-react";

import { generatePassword } from "@/lib/admin/generate-password";
import { toast } from "@/lib/admin/toast";
import { cn } from "@/lib/utils";

import { useActionResult } from "./ActionForm";
import { fieldClass } from "./styles";

// One password input for every admin form: a show/hide toggle, and on fields
// that take a password someone else will use (a temporary password) a
// Generate button that fills a strong policy-passing value and a Copy button.
// The input carries data-secret, so ActionForm never restores it after a
// failed submit, even while it is shown as text.

const iconButton =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export interface PasswordInputProps {
  id?: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Adds Generate and Copy buttons (temporary passwords set for someone else). */
  generate?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function PasswordInput({ id, name, generate = false, className, disabled, ...input }: PasswordInputProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const ref = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  // Hide the value again when the form is cleared after a successful action.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => {
      setVisible(false);
      setCopied(false);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  function fillGenerated() {
    const element = ref.current;
    if (!element) return;
    element.value = generatePassword();
    // Let React-free listeners (and validation styles) see the new value.
    element.dispatchEvent(new Event("input", { bubbles: true }));
    setVisible(true);
    setCopied(false);
    element.focus();
    element.select();
  }

  async function copy() {
    const value = ref.current?.value;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Password copied.");
    } catch {
      toast.error("Could not copy. Select the password and copy it yourself.");
    }
  }

  const trailing = generate ? 3 : 1;
  return (
    <div className={cn("relative", className)}>
      <input
        ref={ref}
        id={inputId}
        name={name}
        type={visible ? "text" : "password"}
        data-secret=""
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        disabled={disabled}
        className={cn(fieldClass, visible && "font-mono", trailing === 3 ? "pr-28" : "pr-11")}
        {...input}
      />
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
        {generate ? (
          <>
            <button type="button" className={iconButton} onClick={fillGenerated} disabled={disabled} aria-label="Generate a strong password" title="Generate">
              <Wand2 size={15} aria-hidden />
            </button>
            <button type="button" className={iconButton} onClick={copy} disabled={disabled} aria-label="Copy password" title="Copy">
              {copied ? <Check size={15} aria-hidden className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={15} aria-hidden />}
            </button>
          </>
        ) : null}
        <button
          type="button"
          className={iconButton}
          onClick={() => setVisible((shown) => !shown)}
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={inputId}
          title={visible ? "Hide" : "Show"}
        >
          {visible ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

/** Label, password input and the field message from the surrounding ActionForm (same layout as Field). */
export function PasswordField({
  label,
  name,
  hint,
  className,
  ...input
}: Omit<PasswordInputProps, "id" | "aria-invalid" | "aria-describedby"> & { label: string; hint?: string }) {
  const state = useActionResult();
  const message = state.fieldErrors?.[name];
  const id = `f-${name}`;
  const describedBy = [hint ? `${id}-hint` : null, message ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <PasswordInput id={id} name={name} className="mt-1.5" aria-invalid={message ? true : undefined} aria-describedby={describedBy} {...input} />
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
