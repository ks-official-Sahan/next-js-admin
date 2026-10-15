// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const PlayerIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, className = "", color = "currentColor", strokeWidth = 2 },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      await animate(
        ".play-icon",
        {
          scale: [1, 0.8],
        },
        {
          duration: 0.4,
          ease: "easeOut",
        },
      );
    }, [animate]);

    const stop = useCallback(async () => {
      await animate(
        ".play-icon",
        {
          scale: [0.8, 1],
        },
        {
          duration: 0.4,
          ease: "easeOut",
        },
      );
    }, [animate]);

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <m.span
        ref={scope}
        onTap={start}
        className={`inline-flex size-full ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          color={color}
          className="play-icon"
          style={{ transformOrigin: "50% 50%" }}
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z" />
        </svg>
      </m.span>
    );
  },
);

PlayerIcon.displayName = "PlayerIcon";
export default PlayerIcon;
