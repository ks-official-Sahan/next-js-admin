// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const ChartLineIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      animate(
        ".chart-line",
        {
          pathLength: [0, 1],
        },
        {
          duration: 0.6,
          ease: "easeInOut",
        },
      );

      animate(
        ".base-line",
        {
          scaleX: [0, 1],
        },
        {
          duration: 0.4,
          ease: "easeOut",
        },
      );
    };

    const stop = async () => {
      animate(
        ".chart-line",
        {
          pathLength: 1,
        },
        {
          duration: 0.2,
          ease: "easeInOut",
        },
      );

      animate(
        ".base-line",
        {
          scaleX: 1,
        },
        {
          duration: 0.2,
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
        className={`${className}`}
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />

        {/* Base line */}
        <m.path
          d="M4 19l16 0"
          className="base-line"
          style={{ transformOrigin: "4px 19px" }}
        />

        {/* Chart line */}
        <m.path
          d="M4 15l4 -6l4 2l4 -5l4 4"
          className="chart-line"
          initial={{ pathLength: 1 }}
        />
      </m.svg>
    );
  },
);

ChartLineIcon.displayName = "ChartLineIcon";

export default ChartLineIcon;
