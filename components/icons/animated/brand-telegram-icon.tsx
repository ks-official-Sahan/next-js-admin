// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const BrandTelegramIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      animate(
        ".plane",
        { x: [0, 10, -10, 0], y: [0, -10, 10, 0], opacity: [1, 0, 0, 1] },
        { duration: 1, times: [0, 0.4, 0.5, 1], ease: "easeInOut" },
      );
    };

    const stop = () => {
      animate(".plane", { x: 0, y: 0, opacity: 1 });
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
        <m.path
          className="plane"
          d="M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4"
        />
      </m.svg>
    );
  },
);

BrandTelegramIcon.displayName = "BrandTelegramIcon";

export default BrandTelegramIcon;
