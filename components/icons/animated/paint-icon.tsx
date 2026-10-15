// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const PaintIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      animate(
        ".roller-symbol",
        {
          y: [0, 4],
          rotate: [0, 12],
        },
        {
          duration: 0.35,
          ease: "easeOut",
        },
      );

      animate(
        ".paint-stroke",
        {
          scaleX: [0, 1],
          opacity: [0, 1],
        },
        {
          duration: 0.35,
          ease: "easeOut",
        },
      );
    }, [animate]);

    const stop = useCallback(async () => {
      animate(".roller-symbol", { y: 0, rotate: 0 }, { duration: 0.3, ease: "easeInOut" });
      animate(".paint-stroke", { scaleX: 0, opacity: 0 }, { duration: 0.3, ease: "easeInOut" });
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

        <m.rect
          className="paint-stroke"
          x="4"
          y="9"
          width="16"
          height="3"
          rx="1.5"
          fill={color}
          style={{
            transformOrigin: "left center",
            opacity: 0,
          }}
        />

        <m.g
          className="roller-symbol"
          style={{ transformOrigin: "50% 50%" }}
        >
          <path d="M5 3m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" />
          <path d="M19 6h1a2 2 0 0 1 2 2a5 5 0 0 1 -5 5l-5 0v2" />
          <path d="M10 15m0 1a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1z" />
        </m.g>
      </m.svg>
    );
  },
);

PaintIcon.displayName = "PaintIcon";
export default PaintIcon;
