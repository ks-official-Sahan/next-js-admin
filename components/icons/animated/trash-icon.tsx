// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const TrashIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const openLid = useCallback(async () => {
      await Promise.all([
        animate(
          ".trash-lid-lower",
          { rotate: -25, y: -4 },
          { duration: 0.25, ease: "easeOut" },
        ),
        animate(
          ".trash-lid-upper",
          { rotate: -35, y: -6, x: -2 },
          { duration: 0.25, ease: "easeOut" },
        ),
      ]);
    }, [animate]);

    const closeLid = useCallback(async () => {
      await Promise.all([
        animate(
          ".trash-lid-lower",
          { rotate: 0, y: 0 },
          { duration: 0.2, ease: "easeInOut" },
        ),
        animate(
          ".trash-lid-upper",
          { rotate: 0, y: 0, x: 0 },
          { duration: 0.2, ease: "easeInOut" },
        ),
      ]);
    }, [animate]);

    useImperativeHandle(ref, () => ({
      startAnimation: openLid,
      stopAnimation: closeLid,
    }));

    return (
      <m.svg
        ref={scope}
        className={`${className} trash-icon`}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />

        <m.path
          d="M4 7l16 0"
          className="trash-lid-lower"
          style={{ transformOrigin: "50% 100%" }}
        />

        <path d="M10 11l0 6" />
        <path d="M14 11l0 6" />
        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />

        <m.path
          d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"
          className="trash-lid-upper"
          style={{ transformOrigin: "50% 100%" }}
        />
      </m.svg>
    );
  },
);

TrashIcon.displayName = "TrashIcon";
export default TrashIcon;
