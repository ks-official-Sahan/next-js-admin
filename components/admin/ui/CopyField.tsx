"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { toast } from "@/lib/admin/toast";
import { cn } from "@/lib/utils";

import { fieldClass } from "./styles";

/**
 * A value to copy (a one-time link): read-only, selected on focus so it can
 * be copied by hand too, with a Copy button. `autoCopy` tries the clipboard
 * as soon as the value arrives; browsers that refuse a copy outside a click
 * still have the button.
 */
export default function CopyField({
  value,
  label,
  hint,
  autoCopy = false,
  className,
}: {
  value: string;
  label: string;
  hint?: string;
  autoCopy?: boolean;
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const copied = copiedValue === value;

  async function copy(quiet = false) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      if (!quiet) toast.success("Copied.");
    } catch {
      inputRef.current?.select();
      if (!quiet) toast.error("Could not copy. The link is selected: copy it yourself.");
    }
  }

  useEffect(() => {
    if (!autoCopy) return;
    // A copy outside a click may be refused; the button stays for that case.
    navigator.clipboard?.writeText(value).then(
      () => setCopiedValue(value),
      () => undefined
    );
  }, [autoCopy, value]);

  return (
    <div className={className}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          ref={inputRef}
          id={id}
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          spellCheck={false}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn(fieldClass, "min-w-0 flex-1 font-mono text-xs")}
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" /> : <Copy aria-hidden className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
