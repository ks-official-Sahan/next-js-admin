"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import React, { useEffect, useState } from "react";

const options = [
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "system", label: "System theme", Icon: Monitor },
  { value: "dark", label: "Dark theme", Icon: Moon },
] as const;

const ThemeSwitch = () => {
  const { theme, setTheme } = useTheme();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="h-[41px] backdrop-blur-sm flex items-center px-[6px] py-[4px] rounded-full border border-border w-fit"
    >
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          onClick={() => setTheme(value)}
          className={`w-[28px] h-[28px] rounded-full flex justify-center items-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#91FF00] ${
            theme === value ? "bg-[#f7f7f7] dark:bg-[#1A1A1A80]" : ""
          } `}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
};

export default ThemeSwitch;
