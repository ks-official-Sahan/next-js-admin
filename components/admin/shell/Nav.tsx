"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, type ReactNode } from "react";

import { isActive } from "@/lib/admin/active";
import { cn } from "@/lib/utils";

export interface NavItemView {
  href: string;
  label: string;
  icon: ReactNode;
}

export interface NavSectionView {
  id: string;
  label: string | null;
  items: NavItemView[];
}

/**
 * Admin navigation links. The server decides which links a user may see and
 * passes them in; this component only marks the current page.
 */
export default function Nav({
  sections,
  onNavigate,
}: {
  sections: NavSectionView[];
  /** Called after a link is followed. The mobile drawer uses it to close. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const idPrefix = useId();

  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {sections.map((section) => {
        const headingId = `${idPrefix}-${section.id}`;
        return (
          <div key={section.id}>
            {section.label ? (
              <p id={headingId} className="px-3 pb-1 text-xs font-medium text-muted-foreground">
                {section.label}
              </p>
            ) : null}
            <ul aria-labelledby={section.label ? headingId : undefined} className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
                      )}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
