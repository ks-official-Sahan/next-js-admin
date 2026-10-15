// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback, useRef } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const MapPinIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();
    // One repeating animation, never an await loop: useAnimate stops it on
    // unmount, and a second start cannot stack another loop.
    const pulse = useRef<ReturnType<typeof animate> | null>(null);

    const start = useCallback(() => {
      pulse.current?.stop();
      pulse.current = animate(
        ".pin-dot",
        { opacity: [1, 0.4, 1] },
        { duration: 0.6, ease: "easeInOut", repeat: Infinity },
      );
    }, [animate]);

    const stop = useCallback(() => {
      pulse.current?.stop();
      pulse.current = null;
      animate(".pin-dot", { opacity: 1 }, { duration: 0.3 });
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
        style={{ overflow: "visible" }}
      >
        {/* Pin Body - Perfectly Static */}
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />

        {/* Inner Dot - The Beacon */}
        <m.circle className="pin-dot" cx="12" cy="10" r="3" />
      </m.svg>
    );
  },
);

MapPinIcon.displayName = "MapPinIcon";
export default MapPinIcon;
