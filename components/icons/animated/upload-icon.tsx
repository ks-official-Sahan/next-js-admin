// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle, useCallback, useEffect, useRef } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const UploadIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();
    // Each start owns a generation; stop and unmount bump it, so an older
    // loop ends at its next step and two loops never drive the arrow.
    const run = useRef(0);
    const running = useRef(false);
    useEffect(() => () => {
      run.current += 1;
    }, []);

    const start = useCallback(async () => {
      if (running.current) return;
      running.current = true;
      const id = ++run.current;
      const live = () => run.current === id;

      while (live()) {
        // 1. Fly Up and Fade Out
        await animate(
          ".arrow-group",
          { y: -12, opacity: 0 },
          { duration: 0.4, ease: "easeIn" },
        );

        if (!live()) break;

        // 2. Instant Reset to Bottom
        await animate(".arrow-group", { y: 12, opacity: 0 }, { duration: 0 });

        // 3. Fly In from Bottom to Center
        await animate(
          ".arrow-group",
          { y: 0, opacity: 1 },
          { duration: 0.4, ease: "easeOut" },
        );

        if (!live()) break;

        // Small pause at center for "intention"
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (run.current === id) running.current = false;
    }, [animate]);

    const stop = useCallback(() => {
      run.current += 1;
      running.current = false;
      animate(
        ".arrow-group",
        { y: 0, opacity: 1 },
        { duration: 0.3, ease: "easeOut" },
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
        style={{ overflow: "visible" }}
      >
        {/* Base bracket */}
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />

        {/* Arrow (Main & Only) */}
        <m.g className="arrow-group">
          <path d="M12 3v12" />
          <path d="m17 8-5-5-5 5" />
        </m.g>
      </m.svg>
    );
  },
);

UploadIcon.displayName = "UploadIcon";
export default UploadIcon;
