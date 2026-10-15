// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const MailFilledIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      await animate(
        ".mail-open",
        {
          rotateX: -60,
          transformOrigin: "50% 0%",
        },
        {
          duration: 0.5,
          ease: "easeInOut",
        },
      );
    }, [animate]);

    const stop = useCallback(() => {
      animate(
        ".mail-open",
        {
          rotateX: 0,
          transformOrigin: "50% 0%",
        },
        {
          duration: 0.5,
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
        className={`${className} perspective-distant`}
      >
        <m.path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <m.path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z" />
        <m.path d="M3 7l9 6l9 -6" className="mail-open" />
      </m.svg>
    );
  },
);

MailFilledIcon.displayName = "MailFilledIcon";
export default MailFilledIcon;
