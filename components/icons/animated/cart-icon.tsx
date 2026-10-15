// Adapted from itshover (https://github.com/itshover/itshover), Apache-2.0.
// Hover is driven by the parent control (../Icon.tsx), not the SVG itself.
import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { m, useAnimate } from "motion/react";

const CartIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      animate(
        ".cart-icon",
        { x: [0, 6, 0] },
        { duration: 0.35, ease: "easeInOut" },
      );
      animate(
        ".cart-wheel-left",
        { rotate: [0, 360] },
        { duration: 0.35, ease: "easeInOut" },
      );

      animate(
        ".cart-wheel-right",
        { rotate: [0, 360] },
        { duration: 0.35, ease: "easeInOut" },
      );
    };

    const stop = () => {
      animate(".cart-icon", { x: 0 }, { duration: 0.2 });
      animate(".cart-wheel-left", { rotate: 0 }, { duration: 0.2 });
      animate(".cart-wheel-right", { rotate: 0 }, { duration: 0.2 });
    };

    useImperativeHandle(ref, () => {
      return {
        startAnimation: start,
        stopAnimation: stop,
      };
    });

    return (
      <m.span
        ref={scope}
        className={`inline-flex size-full ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="cart-icon"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />

          <m.path
            className="cart-wheel-left"
            style={{ transformOrigin: "6px 19px" }}
            d="M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"
          />

          <m.path
            className="cart-wheel-right"
            style={{ transformOrigin: "17px 19px" }}
            d="M17 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"
          />

          <path d="M17 17h-11v-14h-2" />

          <path d="M6 5l14 1l-1 7h-13" />
        </svg>
      </m.span>
    );
  },
);

CartIcon.displayName = "CartIcon";

export default CartIcon;
