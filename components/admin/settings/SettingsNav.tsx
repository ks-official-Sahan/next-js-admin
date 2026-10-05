"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Section navigation for the settings screen. One list, two layouts: a sticky
// row of chips under the top bar on small screens, a sticky column beside the
// sections from lg up. The highlighted entry follows the scroll position
// (IntersectionObserver, no scroll listener), clicking jumps with the native
// anchor (sections carry scroll-margin for the sticky bars) and updates the
// URL hash, so a section can be linked to directly.

/** Below the sticky top bar and chip row, and past the sections' scroll-margin. */
const ACTIVE_LINE_PX = 140;

export interface SettingsNavItem {
  id: string;
  label: string;
}

export default function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // The current section is the last one whose top has scrolled up past a
    // line just below the sticky bars (sections jump there via scroll-margin).
    // The section named in the URL hash (the one just jumped to) wins while
    // its top is in the upper part of the screen: content above can still
    // grow after the jump (fonts, streamed sections), and at the very bottom
    // the last short sections can never reach the line at all.
    const pick = () => {
      let current = items[0]?.id ?? "";
      for (const item of items) {
        const top = document.getElementById(item.id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= ACTIVE_LINE_PX) current = item.id;
      }
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const target = items.some((item) => item.id === hash) ? document.getElementById(hash) : null;
      if (target) {
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        const top = target.getBoundingClientRect().top;
        if (top >= 0 && top < window.innerHeight * (atBottom ? 1 : 0.45)) current = hash;
      }
      setActive(current);
    };
    // No scroll listener. The answer only changes when a section's top
    // crosses the line, and a section starts with its heading
    // (`<id>-title`), so the observer watches headings: with thresholds 0
    // and 1 it calls back exactly as a heading's top edge passes the
    // observer's top edge (the line). The first callback also settles a page
    // opened at #section.
    const observer = new IntersectionObserver(pick, { rootMargin: `-${ACTIVE_LINE_PX}px 0px 0px 0px`, threshold: [0, 1] });
    for (const item of items) {
      const element = document.getElementById(`${item.id}-title`) ?? document.getElementById(item.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [items]);

  // Keep the active chip in view on the horizontal (small screen) row.
  useEffect(() => {
    const link = listRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(active)}"]`);
    if (link && listRef.current && listRef.current.scrollWidth > listRef.current.clientWidth) {
      link.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [active]);

  if (items.length < 2) return null;

  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-14 z-20 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:top-20 lg:mx-0 lg:mb-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
    >
      <p className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:block">On this page</p>
      <ul ref={listRef} className="flex gap-1.5 no-scrollbar overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id} className="shrink-0">
              <a
                href={`#${item.id}`}
                data-id={item.id}
                aria-current={current ? "location" : undefined}
                onClick={() => setActive(item.id)}
                className={cn(
                  "block whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:rounded-md lg:border-0 lg:border-l-2 lg:px-3 lg:py-1.5 lg:text-sm",
                  current
                    ? "border-primary bg-primary text-primary-foreground lg:border-primary lg:bg-muted lg:text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground lg:border-transparent lg:hover:bg-muted/60"
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
