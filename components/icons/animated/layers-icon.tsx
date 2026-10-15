// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const LayersIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      await animate(
        ".top-block",
        { x: -20 },
        { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
      );
    };

    const stop = async () => {
      await animate(
        ".top-block",
        { x: 0 },
        { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
      );
    };

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <m.svg
        ref={scope}
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        strokeWidth={strokeWidth}
        xmlns="http://www.w3.org/2000/svg"
        className={`${className}`}
        style={{ overflow: "visible" }}
      >
        {/* Top block */}
        <m.rect
          className="top-block"
          x="44"
          y="22"
          width="56"
          height="36"
          rx="10"
          fill={color}
        />

        {/* Bottom block */}
        <rect x="20" y="62" width="64" height="40" rx="12" fill={color} />
      </m.svg>
    );
  },
);

LayersIcon.displayName = "LayersIcon";

export default LayersIcon;
