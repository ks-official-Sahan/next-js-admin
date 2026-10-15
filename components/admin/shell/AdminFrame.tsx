"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import type { NavSectionView } from "./Nav";
import Sidebar from "./Sidebar";

/** Cookie the server reads, so the first paint already has the right width. */
export const SIDEBAR_COOKIE = "admin-sidebar";

/**
 * The sidebar and the content column. The sidebar is fixed, so only the page
 * scrolls; collapsing it narrows it to icons and is remembered in a cookie.
 * Ctrl/Cmd+B toggles it, as in most editors.
 */
export default function AdminFrame({
  sections,
  initialCollapsed,
  children,
}: {
  sections: NavSectionView[];
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/admin; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b") {
        const target = event.target as HTMLElement | null;
        // Leave Ctrl+B to editors (bold) and form fields.
        if (target?.closest("input, textarea, select, [contenteditable='true'], .ProseMirror")) return;
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <div style={{ "--admin-sidebar": collapsed ? "4.25rem" : "16rem" } as CSSProperties}>
      <Sidebar sections={sections} collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200 motion-reduce:transition-none lg:pl-[var(--admin-sidebar)]">
        {children}
      </div>
    </div>
  );
}
