// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const Cloud1Icon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(() => {
      // Simple, clean scale pulse
      animate(
        scope.current,
        { scale: [1, 1.05, 1] },
        {
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        },
      );
    }, [animate, scope]);

    const stop = useCallback(() => {
      scope.animations.forEach((animation) => animation.stop());
      animate(scope.current, { scale: 1 }, { duration: 0.3 });
    }, [animate, scope]);

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
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      </m.svg>
    );
  },
);

Cloud1Icon.displayName = "Cloud1Icon";
export default Cloud1Icon;
