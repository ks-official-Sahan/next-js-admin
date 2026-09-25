"use client";

import React, { useEffect, useRef } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { X } from "lucide-react";
import NavItem from "./NavItem";
import ThemeSwitch from "../theme/theme-switch";
import { SiteNavigations } from "@/config/nav";

// Plain-markup replacement for Mantine's Drawer.Root (offset={8} radius="md"),
// rebuilt to the pixel values measured live off the Mantine version at
// 375x812 and 768x1024: an 8px inset on the top/left/bottom edges, width
// min(440px, 100vw-16px) — Mantine's own "md" Drawer size — #111111
// background, 8px corner radius, and the same box-shadow/transition timing.
// role="dialog" + aria-modal, a focus trap, Escape-to-close, and returning
// focus to whatever opened it (the burger button, since that's what has
// focus at open time) make it a WCAG 2.2 AA modal dialog, which the Mantine
// version was not (no explicit trap, no restore-focus).
const SideBar = ({ currentPath, title, opened, close }: SideBarProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  // Body scroll lock while open.
  useEffect(() => {
    if (!opened) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [opened]);

  // Move focus into the panel on open; restore it to whatever had focus
  // before opening (the burger button) on close.
  useEffect(() => {
    if (opened) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      closeButtonRef.current?.focus();
    } else {
      previouslyFocused.current?.focus();
      previouslyFocused.current = null;
    }
  }, [opened]);

  // Escape closes; Tab is trapped inside the panel while open.
  useEffect(() => {
    if (!opened) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [opened, close]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={close}
        className="fixed inset-0 z-[200] bg-black/60 transition-opacity"
        style={{
          opacity: opened ? 1 : 0,
          pointerEvents: opened ? "auto" : "none",
          transitionDuration: prefersReducedMotion ? "0ms" : "200ms",
        }}
      />
      <div
        ref={panelRef}
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} navigation`}
        // Unreachable by keyboard/AT while closed, on top of the transform
        // moving it off-screen — belt and suspenders for a dialog that stays
        // mounted so its close transition can play.
        inert={!opened}
        className="fixed inset-y-2 left-2 z-[201] flex w-[calc(100vw-16px)] max-w-[440px] flex-col overflow-hidden rounded-lg bg-[#111111] text-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_36px_28px_-7px_rgba(0,0,0,0.05),0_17px_17px_-7px_rgba(0,0,0,0.04)] transition-transform ease-out"
        style={{
          transform: opened ? "translateX(0)" : "translateX(calc(-100% - 24px))",
          transitionDuration: prefersReducedMotion ? "0ms" : "250ms",
        }}
      >
        <div className="flex items-center justify-between p-4">
          <span className="text-lg font-bold uppercase text-green-500">{title}</span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close navigation"
            className="flex h-11 w-11 items-center justify-center rounded text-[#acaebf] transition-colors hover:text-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4">
          <div className="flex items-center justify-between">
            <span>Theme:</span>
            <ThemeSwitch />
          </div>

          <div className="mt-6 flex w-full flex-col items-center gap-4">
            {SiteNavigations.sidebar.map((item) => (
              <NavItem
                key={item.title}
                currentPath={currentPath}
                title={item.title}
                isSideBarItem={true}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default SideBar;
