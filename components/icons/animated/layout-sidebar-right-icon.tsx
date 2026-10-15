// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const LayoutSidebarRightIcon = forwardRef<
  AnimatedIconHandle,
  AnimatedIconProps
>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      // Animate the sidebar divider
      animate(
        ".sidebar",
        {
          x: 2,
          scaleX: 1.1,
        },
        {
          duration: 0.3,
          ease: "easeInOut",
        },
      );

      // Pulse the container
      animate(
        ".container",
        {
          scale: 1.02,
        },
        {
          duration: 0.3,
          ease: "easeOut",
        },
      );
    }, [animate]);

    const stop = useCallback(async () => {
      animate(
        ".sidebar, .container",
        {
          x: 0,
          scaleX: 1,
          scale: 1,
        },
        {
          duration: 0.25,
          ease: "easeInOut",
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

        {/* Container */}
        <m.path
          className="container"
          d="M4 4m0 2a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"
        />

        {/* Sidebar divider */}
        <m.path className="sidebar" d="M15 4l0 16" />
      </m.svg>
    );
  },
);

LayoutSidebarRightIcon.displayName = "LayoutSidebarRightIcon";
export default LayoutSidebarRightIcon;
