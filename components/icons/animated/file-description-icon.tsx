// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const FileDescriptionIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      await animate(
        ".file-fold",
        {
          pathLength: [0, 1],
        },
        {
          duration: 0.3,
          ease: "easeOut",
        },
      );

      animate(
        ".file-lines",
        {
          pathLength: [0, 1],
        },
        {
          duration: 0.4,
          ease: "easeOut",
        },
      );
    }, [animate]);

    const stop = useCallback(async () => {
      animate(
        ".file-fold, .file-lines",
        {
          pathLength: 1,
        },
        {
          duration: 0.2,
        },
      );
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

        <m.path d="M14 3v4a1 1 0 0 0 1 1h4" className="file-fold" />

        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />

        <m.path d="M9 17h6" className="file-lines" />
        <m.path d="M9 13h6" className="file-lines" />
      </m.svg>
    );
  },
);

FileDescriptionIcon.displayName = "FileDescriptionIcon";
export default FileDescriptionIcon;
