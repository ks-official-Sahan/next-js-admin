import { cn } from "@/lib/utils";
import React from "react";

interface SectionHeadingProps {
  id: string;
  title: string;
  description?: string;
  /** Optional trailing action (a link), aligned to the heading's baseline. */
  action?: React.ReactNode;
  className?: string;
}

// Title and description stack vertically, capped at a readable measure. No
// eyebrow chip: the heading alone names the section.
const SectionHeading = ({
  id,
  title,
  description,
  action,
  className,
}: SectionHeadingProps) => (
  <div
    className={cn(
      "flex flex-wrap items-end justify-between gap-x-8 gap-y-5",
      className
    )}
  >
    <div className="max-w-[60ch]">
      <h2
        id={id}
        className="text-balance text-[length:clamp(1.75rem,3vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.02em]"
      >
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-base leading-relaxed opacity-70">
          {description}
        </p>
      )}
    </div>
    {action}
  </div>
);

export default SectionHeading;
