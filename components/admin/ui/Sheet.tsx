"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A panel over the page: a bottom sheet on phones, a right-hand side panel
 * from 768px. Built on a native modal <dialog>, so focus is trapped inside,
 * Escape closes it, the page behind is inert, and focus returns to the
 * button that opened it. Controlled: `open` shows it, and every way of
 * closing it (Escape, the backdrop, the close button) calls `onClose`.
 */
export default function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Pinned below the scrolling body. */
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className={cn(
        "m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-hidden rounded-t-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50",
        "s768:ml-auto s768:mt-0 s768:h-dvh s768:max-h-none s768:w-[28rem] s768:rounded-none s768:border-y-0 s768:border-r-0",
        "open:flex open:flex-col open:animate-in open:fade-in-0 open:duration-150 motion-reduce:open:animate-none"
      )}
    >
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        {/* A grab handle tells a phone user this is a sheet; it is decoration only. */}
        <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30 s768:hidden" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-base font-semibold">
            {title}
          </h2>
          {description ? (
            <div id={descriptionId} className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => dialogRef.current?.close()}
          className="-mr-2 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
      {footer ? <div className="border-t border-border px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}
