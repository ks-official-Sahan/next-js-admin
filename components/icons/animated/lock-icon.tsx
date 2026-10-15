// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const LockIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 48, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      await animate(
        ".lock-upper-body",
        { rotate: 40, y: -1.7, x: 3 },
        { duration: 0.28, ease: "easeOut" },
      );
    };

    const stop = async () => {
      await animate(
        ".lock-upper-body",
        { rotate: 0, x: 0, y: 0 },
        { duration: 0.22, ease: "easeInOut" },
      );
    };

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <m.svg
        ref={scope}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${className}`}
        style={{ overflow: "visible" }}
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />

        {/* Lock body */}
        <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z" />

        {/* Keyhole */}
        <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />

        {/* Lock shackle */}
        <m.path
          className="lock-upper-body"
          d="M8 11v-4a4 4 0 1 1 8 0v4"
          style={{ transformOrigin: "50% 100%" }}
        />
      </m.svg>
    );
  },
);

LockIcon.displayName = "LockIcon";

export default LockIcon;
