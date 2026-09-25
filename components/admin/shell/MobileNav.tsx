"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

import Nav, { type NavSectionView } from "./Nav";

/**
 * Navigation drawer for widths below the desktop sidebar (1024px). A native
 * modal <dialog> gives focus trapping, Escape to close and focus return for
 * free. It closes itself when a link is followed or the viewport grows past
 * the sidebar breakpoint, so the page is never left inert behind a hidden
 * dialog.
 */
export default function MobileNav({ sections }: { sections: NavSectionView[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (query.matches) dialogRef.current?.close();
    };
    query.addEventListener("change", closeOnDesktop);
    return () => query.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] border-r border-border bg-card p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
          <div className="flex items-center justify-between px-3">
            <span id={titleId} className="text-base font-semibold">
              Menu
            </span>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex size-9 items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <Nav sections={sections} onNavigate={() => dialogRef.current?.close()} />
        </div>
      </dialog>
    </div>
  );
}
