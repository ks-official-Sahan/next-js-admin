"use client";

import { useTheme } from "next-themes";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import React, { useSyncExternalStore } from "react";
import ParticlesX from "../animations/ParticlesX";

const subscribeNever = () => () => {};

const Particals = ({
  className = "absolute inset-0",
  quantity = 100,
  size = 0.5,
}) => {
  const { theme } = useTheme();
  // Client-only: false during SSR and hydration, true afterwards, with no
  // extra state-in-effect render (the theme is unknown on the server).
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const reduceMotion = useReducedMotion();

  if (!mounted || reduceMotion) return null;

  const color =
    theme === "dark" ? "#ffffff" : theme === "system" ? "#a855f7" : "#000000";

  return (
    <>
      <ParticlesX
        vx={-0.8}
        className={className}
        quantity={quantity}
        ease={80}
        color={color}
        size={size}
        refresh
      />
    </>
  );
};

export default Particals;
