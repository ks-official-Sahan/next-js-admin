// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const CpuIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      animate(
        ".pins",
        { scale: [1, 1.15, 1] },
        { duration: 0.5, ease: "easeInOut" },
      );
      animate(
        ".inner",
        { scale: [1, 0.9, 1] },
        { duration: 0.5, ease: "easeInOut" },
      );
      animate(
        ".outer",
        { scale: [1, 1.05, 1] },
        { duration: 0.5, ease: "easeInOut" },
      );
    };

    const stop = () => {
      animate(
        ".pins, .inner, .outer",
        { scale: 1 },
        { duration: 0.2, ease: "easeInOut" },
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
        <m.g className="pins">
          <path d="M12 20v2" />
          <path d="M12 2v2" />
          <path d="M17 20v2" />
          <path d="M17 2v2" />
          <path d="M2 12h2" />
          <path d="M2 17h2" />
          <path d="M2 7h2" />
          <path d="M20 12h2" />
          <path d="M20 17h2" />
          <path d="M20 7h2" />
          <path d="M7 20v2" />
          <path d="M7 2v2" />
        </m.g>
        <m.rect
          className="outer"
          style={{ transformOrigin: "12px 12px" }}
          x="4"
          y="4"
          width="16"
          height="16"
          rx="2"
        />
        <m.rect
          className="inner"
          style={{ transformOrigin: "12px 12px" }}
          x="8"
          y="8"
          width="8"
          height="8"
          rx="1"
        />
      </m.svg>
    );
  },
);

CpuIcon.displayName = "CpuIcon";

export default CpuIcon;
