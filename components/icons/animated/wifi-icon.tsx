// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const WifiIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      animate(
        ".wave-1",
        { opacity: [1, 0.3, 1] },
        { duration: 0.6, ease: "easeInOut" },
      );
      animate(
        ".wave-2",
        { opacity: [1, 0.3, 1] },
        { duration: 0.6, ease: "easeInOut", delay: 0.15 },
      );
      animate(
        ".wave-3",
        { opacity: [1, 0.3, 1] },
        { duration: 0.6, ease: "easeInOut", delay: 0.3 },
      );
    }, [animate]);

    const stop = useCallback(() => {
      animate(".wave-1", { opacity: 1 }, { duration: 0.2, ease: "easeOut" });
      animate(".wave-2", { opacity: 1 }, { duration: 0.2, ease: "easeOut" });
      animate(".wave-3", { opacity: 1 }, { duration: 0.2, ease: "easeOut" });
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
        <path d="M12 18l.01 0" />
        <m.path className="wave-1" d="M9.172 15.172a4 4 0 0 1 5.656 0" />
        <m.path className="wave-2" d="M6.343 12.343a8 8 0 0 1 11.314 0" />
        <m.path
          className="wave-3"
          d="M3.515 9.515c4.686 -4.687 12.284 -4.687 17 0"
        />
      </m.svg>
    );
  },
);

WifiIcon.displayName = "WifiIcon";
export default WifiIcon;
