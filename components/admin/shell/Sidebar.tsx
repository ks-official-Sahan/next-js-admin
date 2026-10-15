import Link from "next/link";

import Icon from "@/components/icons/Icon";
import { ADMIN_HOME } from "@/lib/admin/active";
import { Site } from "@/config/site";
import { cn } from "@/lib/utils";

import Nav, { type NavSectionView } from "./Nav";

/**
 * Fixed sidebar for widths from 1024px up (smaller screens use MobileNav). It
 * never scrolls with the page; a long nav scrolls inside it. Collapsed, it
 * shows icons only, with each label kept for screen readers and as a tooltip.
 */
export default function Sidebar({
  sections,
  collapsed,
  onToggle,
}: {
  sections: NavSectionView[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--admin-sidebar)] flex-col border-r border-border bg-card transition-[width] duration-200 motion-reduce:transition-none lg:flex"
      aria-label="Admin sidebar"
    >
      <div className={cn("flex h-14 shrink-0 items-center border-b border-border", collapsed ? "justify-center px-2" : "px-4")}>
        <Link
          href={ADMIN_HOME}
          title={collapsed ? `${Site.siteName} Admin` : undefined}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? (
            <span className="grid size-7 place-items-center rounded bg-[#91FF00] text-sm font-bold text-black">{Site.siteName.charAt(0)}</span>
          ) : (
            <>
              {Site.siteName}
              <span className="rounded bg-[#91FF00] px-1.5 py-0.5 text-[11px] font-semibold leading-none text-black">Admin</span>
            </>
          )}
        </Link>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-4", collapsed ? "px-2" : "px-3")}>
        <Nav sections={sections} collapsed={collapsed} />
      </div>
      <div className={cn("shrink-0 border-t border-border p-2", collapsed && "flex justify-center")}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-keyshortcuts="Control+B Meta+B"
          title={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
          className={cn(
            "flex h-9 items-center gap-3 rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed ? "w-9 justify-center" : "w-full px-3"
          )}
        >
          <Icon lucideIconName={collapsed ? "PanelLeftOpen" : "PanelLeftClose"} />
          <span className={collapsed ? "sr-only" : undefined}>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
        </button>
      </div>
    </aside>
  );
}
