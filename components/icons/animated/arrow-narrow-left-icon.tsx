// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const ArrowNarrowLeftIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      await animate(
        ".arrow-group",
        { x: [0, -4, 0] },
        { duration: 0.5, ease: "easeInOut" },
      );
    };

    const stop = () => {
      animate(".arrow-group", { x: 0 }, { duration: 0.2, ease: "easeOut" });
    };

    useImperativeHandle(ref, () => {
      return {
        startAnimation: start,
        stopAnimation: stop,
      };
    });

    return (
      <m.span
        ref={scope}
        className={`inline-flex size-full items-center justify-center ${className}`}
      >
        <svg
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
          <m.g className="arrow-group">
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <path d="M5 12l14 0" />
            <path d="M5 12l4 4" />
            <path d="M5 12l4 -4" />
          </m.g>
        </svg>
      </m.span>
    );
  },
);

ArrowNarrowLeftIcon.displayName = "ArrowNarrowLeftIcon";

export default ArrowNarrowLeftIcon;
