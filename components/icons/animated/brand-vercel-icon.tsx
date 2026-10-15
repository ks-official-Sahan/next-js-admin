// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const BrandVercelIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      await animate(
        ".triangle",
        { rotateY: 180 },
        { duration: 0.6, ease: "easeInOut" },
      );
    };

    const stop = async () => {
      await animate(
        ".triangle",
        { rotateY: 0 },
        { duration: 0.6, ease: "easeInOut" },
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
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <m.path className="triangle" d="M3 19h18l-9 -15z" />
      </m.svg>
    );
  },
);

BrandVercelIcon.displayName = "BrandVercelIcon";
export default BrandVercelIcon;
