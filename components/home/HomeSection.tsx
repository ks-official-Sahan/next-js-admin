import { cn } from "@/lib/utils";
import React from "react";

// One fluid container for the whole home page. Gutters and max width step up
// with the viewport instead of being a fixed percentage, so a 390px phone, a
// 1024px tablet, a 1440px laptop and a 2560px monitor each get a comfortable
// measure rather than one scaled layout.
export const homeContainer =
  "mx-auto w-full px-4 s640:px-8 lg:px-10 max-w-[1240px] xl:max-w-[1440px] s1920:max-w-[1680px]";

export const HomeContainer = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => <div className={cn(homeContainer, className)}>{children}</div>;

interface HomeSectionProps {
  id: string;
  /** id of the section's h2, used as the region's accessible name. */
  labelledBy?: string;
  /** Fallback accessible name for sections without a visible heading. */
  label?: string;
  /** Full-bleed tinted band, used to break the page into distinct chapters. */
  band?: boolean;
  className?: string;
  children: React.ReactNode;
}

// One place for the vertical rhythm of every home section: fluid, from 64px
// on phones to 112px on large screens.
const HomeSection = ({
  id,
  labelledBy,
  label,
  band = false,
  className,
  children,
}: HomeSectionProps) => (
  <section
    id={id}
    aria-labelledby={labelledBy}
    aria-label={labelledBy ? undefined : label}
    className={cn(
      "w-full pt-[clamp(4rem,8vw,7rem)]",
      band &&
        "mt-[clamp(4rem,8vw,7rem)] border-y border-bBORDERFADE bg-bFCARD pb-[clamp(4rem,8vw,7rem)]",
      band && "pt-[clamp(4rem,8vw,7rem)]",
      className
    )}
  >
    <HomeContainer>{children}</HomeContainer>
  </section>
);

/** Index for the CSS stagger (see `.hero-rise` in globals.css). */
export const stagger = (index: number) =>
  ({ "--i": index }) as React.CSSProperties;

export default HomeSection;
