"use client";

import React from "react";
import ThemeSwitch from "../theme/theme-switch";
import Link from "next/link";
import { Menu } from "lucide-react";
import { SiteNavigations } from "@/config/nav";
import NavItem from "./NavItem";

const NavBar = ({ title, currentPath, opened, toggle }: NavBarProps) => {
  return (
    <nav className="flex items-center justify-between w-full relative ">
      {/* LEFT */}
      <div className="z-[50]">
        <Link href={"/"} className="font-bold uppercase text-xl text-green-500">
          {title}
        </Link>
      </div>

      {/* CENTER lg */}
      <div className="absolute hidden-md-flex-lg flex-col items-center w-full z-[10]">
        <div className="p-[3px] flex items-center gap-[2px] text-[14px] h-[42px] rounded-full border border-white/[0.12] bg-[#0b101b]/80 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
          {SiteNavigations.navbar.map((item) => (
            <NavItem
              key={item.title}
              currentPath={currentPath}
              title={item.title}
            />
          ))}
        </div>
      </div>

      {/* CENTER md */}
      <div className="absolute hidden md:flex flex-col items-center w-full z-[10]">
        <div className="p-[3px] flex items-center gap-[2px] text-[14px] h-[42px] rounded-full border border-white/[0.12] bg-[#0b101b]/80 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
          {SiteNavigations.sidebar.map((item) => (
            <NavItem
              key={item.title}
              currentPath={currentPath}
              title={item.title}
            />
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div className="hidden-sm-flex-lg items-center gap-6 z-[50]">
        <ThemeSwitch />
        <Link
          href="/contact"
          className="md:hidden text-[14px] font-semibold dark:text-black text-white bg-[#19cf31] dark:bg-[#91FF00] h-[37px] px-[20px] rounded-[15px] flex justify-center items-center"
        >
          Let&apos;s Talk
        </Link>
      </div>

      {/* MENUBAR */}
      <div className="flex-sm-hidden-lg">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={opened}
          aria-controls="mobile-nav-drawer"
          aria-label={opened ? "Close navigation" : "Open navigation"}
          className="flex h-11 w-11 items-center justify-center rounded text-white/90"
        >
          <Menu size={24} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};

export default NavBar;
