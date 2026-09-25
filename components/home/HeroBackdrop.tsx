"use client";

import Particals from "@/components/custom/Particals";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import React, { useEffect, useRef } from "react";

// Hero atmosphere, all decorative (aria-hidden, pointer-events none):
//   1. an accent glow that drifts a few percent (transform only)
//   2. a masked grid that fades out toward the edges
//   3. a spotlight that follows the pointer, written straight to CSS
//      variables in a rAF so React never re-renders while moving
// Touch devices and reduced-motion users get 1 and 2 without the spotlight.
const HeroBackdrop = ({ children }: { children: React.ReactNode }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    const spot = spotRef.current;
    if (!root || !spot || reduceMotion) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = root.getBoundingClientRect();
        spot.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        spot.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    };

    root.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", onMove);
    };
  }, [reduceMotion]);

  return (
    <div ref={rootRef} className="hero-root relative w-full overflow-hidden">
      <div
        aria-hidden="true"
        // Fade the atmosphere out at the bottom so the hero has no hard edge.
        className="pointer-events-none absolute inset-0 z-0 [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]"
      >
        <div className="hero-glow absolute -inset-[10%]" />
        <div className="hero-grid absolute inset-0" />
        <div ref={spotRef} className="hero-spotlight absolute inset-0" />
        <Particals quantity={90} size={0.5} />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default HeroBackdrop;
