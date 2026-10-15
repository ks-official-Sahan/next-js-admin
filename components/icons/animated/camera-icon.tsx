// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const CameraIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      animate(".lens", { scale: 1.2 }, { duration: 0.3, ease: "easeOut" });
      animate(".body", { scale: 0.95 }, { duration: 0.3, ease: "easeOut" });
    };

    const stop = () => {
      animate(".lens", { scale: 1 }, { duration: 0.2, ease: "easeInOut" });
      animate(".body", { scale: 1 }, { duration: 0.2, ease: "easeInOut" });
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
        <m.path
          className="body"
          d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"
        />
        <m.circle
          className="lens"
          style={{ transformOrigin: "12px 13px" }}
          cx="12"
          cy="13"
          r="3"
        />
      </m.svg>
    );
  },
);

CameraIcon.displayName = "CameraIcon";

export default CameraIcon;
