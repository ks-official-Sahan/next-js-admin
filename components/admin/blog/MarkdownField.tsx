"use client";

import { cn } from "@/lib/utils";

// Tab-friendly Markdown textarea for the Body card's "Markdown" mode
// (components/admin/blog/BodyEditorCard.tsx). Plain and monospace by
// design — no client-side Markdown linting/highlighting library was added
// for this (ponytail: the Visual mode + live preview already cover
// "what will this look like", so this stays a plain, predictable text box).

export default function MarkdownField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Sizing from the parent (Split mode gives it a fixed, viewport-based height). */
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        // Tab inserts two spaces instead of moving focus out of the field —
        // expected behavior in a code/markdown editor.
        if (event.key !== "Tab") return;
        event.preventDefault();
        const target = event.currentTarget;
        const { selectionStart, selectionEnd } = target;
        const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
        onChange(next);
        requestAnimationFrame(() => {
          target.selectionStart = target.selectionEnd = selectionStart + 2;
        });
      }}
      placeholder={placeholder}
      spellCheck={false}
      aria-label="Post body, Markdown"
      className={cn(
        "block min-h-[320px] w-full resize-y rounded-md border border-input bg-background px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    />
  );
}
