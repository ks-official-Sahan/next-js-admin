// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";

import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const ClockIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      await animate(
        ".clock-hands",
        {
          rotate: 360,
        },
        {
          duration: 1,
          ease: "easeInOut",
        },
      );
    };

    const stop = async () => {
      await animate(
        ".clock-hands",
        {
          rotate: 0,
        },
        {
          duration: 1,
          ease: "easeInOut",
        },
      );
    };

    useImperativeHandle(ref, () => {
      return {
        startAnimation: start,
        stopAnimation: stop,
      };
    });

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
        className={className}
      >
        <m.path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <m.path
          d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"
          className="clock-body"
        />
        <m.path d="M12 7v5l3 3" className="clock-hands" style={{ transformBox: "view-box", transformOrigin: "12px 12px" }} />
      </m.svg>
    );
  },
);

ClockIcon.displayName = "ClockIcon";

export default ClockIcon;
