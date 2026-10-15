"use client";

import { LazyMotion, domAnimation, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ComponentType, type RefAttributes } from "react";

import { cn } from "@/lib/utils";

import { ANIMATED_ICONS, type ItshoverIconName } from "./animated-registry";
import type { AnimatedIconHandle, AnimatedIconProps } from "./animated/types";
import { LUCIDE_ICONS, type LucideIconName } from "./lucide-registry";

export type { ItshoverIconName, LucideIconName };

type AnimatedComponent = ComponentType<AnimatedIconProps & RefAttributes<AnimatedIconHandle>>;

/** The control whose hover or keyboard focus plays the icon's animation. */
const TRIGGER = "a, button, summary, label, [role='button'], [role='menuitem'], [role='tab'], [data-icon-trigger]";

export interface IconProps {
  /** An animated itshover icon (components/icons/animated). Wins over `lucideIconName`. */
  name?: ItshoverIconName;
  /** A static lucide icon, for names itshover does not have. */
  lucideIconName?: LucideIconName;
  /** Size and color utilities. The SVG fills the box; the default is `size-4`. */
  className?: string;
  /** Accessible name. Without it the icon is decorative (`aria-hidden`). */
  label?: string;
  strokeWidth?: number;
  /** Pixel size, for call sites that size by number rather than class. */
  size?: number;
}

/** An icon choice that a config or CMS map can store and pass to <Icon>. */
export type IconSpec = Pick<IconProps, "name" | "lucideIconName">;

/**
 * One icon for the whole app. An animated icon plays when the surrounding
 * link or button is hovered or keyboard-focused, so the whole control is the
 * target, not the few pixels of the SVG. Reduced motion keeps it still. Each
 * animated icon is its own chunk, so a page loads only the icons it shows.
 */
export default function Icon({ name, lucideIconName, className, label, strokeWidth, size }: IconProps) {
  const wrapper = useRef<HTMLSpanElement>(null);
  const handle = useRef<AnimatedIconHandle>(null);
  const reduced = useReducedMotion();
  const Animated = (name ? ANIMATED_ICONS[name] : null) as AnimatedComponent | null;
  const Static = !Animated && lucideIconName ? LUCIDE_ICONS[lucideIconName] : null;

  useEffect(() => {
    const own = wrapper.current;
    if (!Animated || reduced || !own) return;
    const target = own.parentElement?.closest<HTMLElement>(TRIGGER) ?? own;
    const start = () => handle.current?.startAnimation();
    const stop = () => handle.current?.stopAnimation();
    // The focused element, not the trigger: focus may land on a child
    // (an input inside a label).
    const focusIn = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.matches(":focus-visible")) start();
    };
    target.addEventListener("pointerenter", start);
    target.addEventListener("pointerleave", stop);
    target.addEventListener("focusin", focusIn);
    target.addEventListener("focusout", stop);
    return () => {
      target.removeEventListener("pointerenter", start);
      target.removeEventListener("pointerleave", stop);
      target.removeEventListener("focusin", focusIn);
      target.removeEventListener("focusout", stop);
    };
  }, [Animated, reduced]);

  return (
    <span
      ref={wrapper}
      className={cn("inline-flex size-4 shrink-0", className)}
      style={size ? { width: size, height: size } : undefined}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {Animated ? (
        <LazyMotion features={domAnimation}>
          <Animated ref={handle} size="100%" strokeWidth={strokeWidth} />
        </LazyMotion>
      ) : Static ? (
        <Static size="100%" strokeWidth={strokeWidth} aria-hidden />
      ) : null}
    </span>
  );
}
