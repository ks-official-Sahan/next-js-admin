// Written for this project in the style of itshover's icons (../Icon.tsx drives hover).
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { useAnimate } from "motion/react";

const ArrowUpRightIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
    const [scope, animate] = useAnimate();

    useImperativeHandle(ref, () => ({
      startAnimation: () => {
        animate(".arrow", { x: [0, 3, 0], y: [0, -3, 0] }, { duration: 0.45, ease: "easeInOut" });
      },
      stopAnimation: () => {
        animate(".arrow", { x: 0, y: 0 }, { duration: 0.2, ease: "easeOut" });
      },
    }));

    return (
      <svg
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
        style={{ overflow: "visible" }}
      >
        <g className="arrow">
          <path d="M7 7h10v10" />
          <path d="M7 17 17 7" />
        </g>
      </svg>
    );
  },
);

ArrowUpRightIcon.displayName = "ArrowUpRightIcon";
export default ArrowUpRightIcon;
