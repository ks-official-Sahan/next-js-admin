"use client";

import { type ReactNode, useId, useState } from "react";

import Icon from "@/components/icons/Icon";
import { cn } from "@/lib/utils";

// A collapsible sidebar card (work item 3: "right sidebar cards... collapsible"),
// built on a native <button aria-expanded> rather than <details> so the
// chevron can animate and the open/closed state is easy to default per card —
// e.g. collapsing Publishing/SEO by default on a long post while the AI
// assistant stays open. Fully keyboard operable, no extra state needed by
// the parent.

export default function SidebarCard({
  title,
  actions,
  defaultOpen = true,
  children,
}: {
  title: string;
  /** Rendered next to the title, inside the header row (e.g. a "Suggest SEO" button) — stays clickable without toggling the card. */
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex flex-1 items-center gap-1.5 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="down-chevron" className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          {title}
        </button>
        {actions}
      </div>
      <div id={panelId} hidden={!open} className="p-5 pt-3">
        {children}
      </div>
    </div>
  );
}
