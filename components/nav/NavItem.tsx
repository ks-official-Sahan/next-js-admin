"use client";

import Link from "next/link";
import React from "react";

const NavItem = ({
  currentPath,
  title,
  path = title === "Home" ? "" : title.toLowerCase(),
  isSideBarItem = false,
}: NavItemProps) => {
  const isCurrentPath = currentPath === title.toLowerCase();

  return (
    <Link
      href={`/${path}`}
      aria-current={isCurrentPath ? "page" : undefined}
      className={`
        relative flex items-center justify-center select-none
        rounded-full font-medium text-[13.5px] tracking-[-0.01em]
        transition-all duration-150
        active:scale-[0.97]
        ${isSideBarItem ? "w-full h-[40px] px-5" : "h-[33px] px-[18px]"}
        ${
          isCurrentPath
            ? "border border-white/15 bg-white/[0.08] text-white font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
            : "text-white/65 hover:text-white border border-transparent"
        }
      `}
    >
      {title}
    </Link>
  );
};

export default NavItem;
