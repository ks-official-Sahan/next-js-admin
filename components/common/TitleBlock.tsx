import { cn } from "@/lib/utils";
import React from "react";

interface TitleBlockProps {
  title: string;
  label: string;
  className?: string;
  icon?: React.ReactNode;
  /** Heading level for the title. Defaults to a plain `div`. */
  titleAs?: "div" | "h2" | "h3";
  titleClass?: string;
  labelClass?: string;
  iconContainerClass?: string;
  isBadge?: boolean;
  badgeClass?: string;
  isSubtitle?: boolean;
  subtitle?: string;
  subTitleClass?: string;
}

const TitleBlock = ({
  title,
  label,
  className,
  icon,
  titleAs: TitleTag = "div",
  isBadge = false,
  isSubtitle = false,
  subtitle,
  iconContainerClass = "gap-[6px]",
  labelClass = "text-[14px] font-medium opacity-60 pt-[1px]",
  titleClass = "pt-[6px] font-semibold",
  badgeClass = "pl-[10px] pr-[20px] py-[6px] rounded-full border w-fit bg-bCHIP",
  subTitleClass = "text-[15px] opacity-65",
}: TitleBlockProps) => {
  return (
    <div className={className}>
      {/* ICON & LABEL */}
      <div
        className={cn("flex items-center", iconContainerClass, isBadge && badgeClass)}
      >
        {icon}
        <div className={labelClass}>{label}</div>
      </div>

      {/* TITLE */}
      <TitleTag className={titleClass}>{title}</TitleTag>

      {/* SUBTITLE */}
      {isSubtitle && subtitle && <div className={subTitleClass}>{subtitle}</div>}
    </div>
  );
};

export default TitleBlock;
