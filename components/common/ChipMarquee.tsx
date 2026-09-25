import Marquee from "@/components/ui/marquee";
import { cn } from "@/lib/utils";
import React from "react";

interface ChipMarqueeProps {
  /** Accessible name for the list of chips. */
  label: string;
  /** Seconds for one full loop. Slower reads better; 30-45 is comfortable. */
  duration?: number;
  reverse?: boolean;
  /** Below this many chips a scrolling row looks empty, so they just wrap. */
  minItems?: number;
  className?: string;
  children: React.ReactNode;
}

const fade =
  "[mask-image:linear-gradient(to_right,transparent,#000_6%,#000_94%,transparent)]";

// A row of chips that drifts sideways on its own and stops the moment the
// pointer is over it, so anyone can stop and read a chip. Three guards keep
// it accessible:
//   - the moving copy is aria-hidden; a plain list carries the content for
//     assistive tech (visually hidden while the marquee is showing)
//   - with prefers-reduced-motion the marquee is dropped and the same chips
//     wrap in place, so nothing is clipped
//   - short lists never scroll (a marquee of two chips looks broken)
const ChipMarquee = ({
  label,
  duration = 36,
  reverse,
  minItems = 5,
  className,
  children,
}: ChipMarqueeProps) => {
  const items = React.Children.toArray(children);

  const list = (extra?: string) => (
    <ul aria-label={label} className={cn("flex flex-wrap gap-2", extra)}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );

  if (items.length < minItems) {
    return <div className={className}>{list()}</div>;
  }

  return (
    <div className={className}>
      {list(
        "sr-only motion-reduce:not-sr-only motion-reduce:flex motion-reduce:flex-wrap"
      )}
      <div aria-hidden="true" className={cn("motion-reduce:hidden", fade)}>
        <Marquee
          pauseOnHover
          reverse={reverse}
          className="p-0 [--gap:0.5rem]"
          style={{ "--duration": `${duration}s` } as React.CSSProperties}
        >
          {items}
        </Marquee>
      </div>
    </div>
  );
};

export default ChipMarquee;
