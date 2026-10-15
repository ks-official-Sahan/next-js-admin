// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const CodeIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      animate(".left-bracket", { x: -3 }, { duration: 0.3, ease: "easeOut" });
      animate(".right-bracket", { x: 3 }, { duration: 0.3, ease: "easeOut" });
    };

    const stop = () => {
      animate(".left-bracket", { x: 0 }, { duration: 0.2, ease: "easeInOut" });
      animate(".right-bracket", { x: 0 }, { duration: 0.2, ease: "easeInOut" });
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
        <m.path className="right-bracket" d="m16 18 6-6-6-6" />
        <m.path className="left-bracket" d="m8 6-6 6 6 6" />
      </m.svg>
    );
  },
);

CodeIcon.displayName = "CodeIcon";

export default CodeIcon;
