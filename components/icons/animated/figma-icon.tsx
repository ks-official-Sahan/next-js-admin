// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const FigmaIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      animate(
        ".circle",
        { rotate: [0, 360, 0] },
        { duration: 0.8, ease: "easeInOut" },
      );
      animate(
        ".layer1",
        { x: [-1, 1, -1, 0] },
        { duration: 0.6, ease: "easeInOut" },
      );
      animate(
        ".layer2",
        { x: [1, -1, 1, 0] },
        { duration: 0.6, ease: "easeInOut" },
      );
    }, [animate]);

    const stop = useCallback(() => {
      animate(
        ".circle, .layer1, .layer2",
        { rotate: 0, x: 0 },
        { duration: 0.2, ease: "easeInOut" },
      );
    }, [animate]);

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
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <m.path
          className="circle"
          style={{ transformOrigin: "center" }}
          d="M15 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"
        />
        <m.path
          className="layer1"
          d="M6 3m0 3a3 3 0 0 1 3 -3h6a3 3 0 0 1 3 3v0a3 3 0 0 1 -3 3h-6a3 3 0 0 1 -3 -3z"
        />
        <m.path
          className="layer2"
          d="M9 9a3 3 0 0 0 0 6h3m-3 0a3 3 0 1 0 3 3v-15"
        />
      </m.svg>
    );
  },
);

FigmaIcon.displayName = "FigmaIcon";
export default FigmaIcon;
