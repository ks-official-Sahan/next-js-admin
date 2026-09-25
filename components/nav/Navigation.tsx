"use client";

import React, { useCallback, useEffect, useState } from "react";
import WrapperBody from "../wrappers/WrapperBody";
import { usePathname } from "next/navigation";
import { Site } from "@/config/site";
import SideBar from "./SideBar";
import NavBar from "./Nav";

const SECTIONS = new Set(["updates", "blog", "contact"]);

// Active nav section from the first path segment, so nested pages such as
// /updates/<slug> keep their section lit. Derived during render, so the
// server HTML already carries the active state.
const sectionFor = (path: string) => {
  if (path === "/") return "home";
  const first = path.split("/")[1] ?? "";
  return SECTIONS.has(first) ? first : "";
};

const Navigation = () => {
  const [isVisible, setIsVisible] = useState(true);
  const currentPath = sectionFor(usePathname());

  const [opened, setOpened] = useState(false);
  const toggle = useCallback(() => setOpened((value) => !value), []);
  const close = useCallback(() => setOpened(false), []);

  const lastScrollY = React.useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScroll = window.scrollY;
      setIsVisible(currentScroll <= lastScrollY.current || currentScroll < 10);
      lastScrollY.current = currentScroll;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []); // stable — registered once

  return (
    <>
      {/* Drawer --> SideBar. Rendered as a sibling of the header, not a
          child: the header hides and slides in via a CSS `transform`, and
          a transformed ancestor becomes the containing block for any
          `position: fixed` descendant (CSS spec), which silently broke this
          drawer's viewport-relative sizing when it was nested inside — its
          width/height resolved against the header's own box instead of the
          viewport. Mantine's original Drawer never hit this because it
          portals to document.body; this sidesteps the same problem by simply
          not being a descendant of the transformed element. */}
      <SideBar
        title={Site.siteName}
        opened={opened}
        close={close}
        currentPath={currentPath}
      />

      {/* .site-header (style/globals.css) plays the slide-in from CSS, so the
          header is on screen from the first paint rather than after
          hydration, and transitions this inline transform when scrolling.
          Both are switched off under prefers-reduced-motion. */}
      <header
        style={{ transform: isVisible ? "none" : "translateY(-100%)" }}
        className="site-header w-full fixed top-0 pt-[30px] z-[100]"
      >
        <WrapperBody>
          <NavBar
            title={Site.siteName}
            currentPath={currentPath}
            opened={opened}
            toggle={toggle}
          />
        </WrapperBody>
      </header>
    </>
  );
};

export default Navigation;
