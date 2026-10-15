"use client";

import { LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import type { ReactNode } from "react";

// Staggered entrance for dashboard sections: a short fade and lift, once.
// LazyMotion loads only the DOM animation features (no layout/drag), and
// reducedMotion="user" turns it into an instant render for people who ask
// the system for less motion. The content is in the server HTML either way.

const EASE = [0.22, 1, 0.36, 1] as const;

export function RevealGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <m.div className={className} initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: 0.045 } } }}>
          {children}
        </m.div>
      </MotionConfig>
    </LazyMotion>
  );
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 6 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } },
      }}
    >
      {children}
    </m.div>
  );
}
