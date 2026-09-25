"use client";
import { Handshake, HomeIcon, Rss } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

const FooterNav = ({ className }: { className?: string }) => {
  const [currentPath, setCurrentPath] = useState("");
  const path = usePathname();

  const router = useRouter();

  const handleNavigation = (href: "home" | "updates" | "contact") => {
    if (href === "home") {
      router.push("/", { scroll: true });
    } else if (href === "updates") {
      router.push("/updates", { scroll: true });
    } else if (href === "contact") {
      router.push("/contact", { scroll: true });
    }
  };

  useEffect(() => {
    const changeCurrentPath = () => {
      if (path === "/") {
        setCurrentPath("home");
      } else if (path.endsWith("updates")) {
        setCurrentPath("updates");
      } else if (path.endsWith("contact")) {
        setCurrentPath("contact");
      }
    };

    changeCurrentPath();
  }, [path]);

  return (
    <nav
      aria-label="Footer"
      className={`${className} w-fit h-fit border rounded-[12px] flex items-center`}
    >
      <div className="flex flex-col">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => handleNavigation("home")}
            aria-label="Home"
            aria-current={currentPath === "home" ? "page" : undefined}
            className={`min-w-[50px] w-[50px] h-[50px] border-b border-r rounded-tl-[12px] rounded-bl-[12px] rounded-r-none
                ${
                  currentPath === "home"
                    ? "bg-[#f7f7f7] dark:bg-[#00000032] text-[#19cf31] dark:text-[#91FF00]"
                    : "bg-transparent text-[#9c9c9c]"
                }
                `}
          >
            <div className="w-full h-full flex justify-center items-center">
              <HomeIcon size={20} />
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleNavigation("updates")}
            aria-label="Updates"
            aria-current={currentPath === "updates" ? "page" : undefined}
            className={`min-w-[50px] w-[50px] h-[50px] border-r bg-transparent rounded-none
                ${
                  currentPath === "updates"
                    ? "bg-[#f7f7f7] dark:bg-[#00000032] text-[#19cf31] dark:text-[#91FF00]"
                    : "bg-transparent text-[#9c9c9c]"
                }
                `}
          >
            <div className="w-full h-full flex justify-center items-center">
              <Rss size={20} />
            </div>
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => handleNavigation("contact")}
        aria-label="Contact"
        aria-current={currentPath === "contact" ? "page" : undefined}
        className={`min-w-[50px] w-[50px] h-[100px] rounded-r-[12px] bg-transparent rounded-l-none
            ${
              currentPath === "contact"
                ? "bg-[#f7f7f7] dark:bg-[#00000032] text-[#19cf31] dark:text-[#91FF00]"
                : "bg-transparent text-[#9c9c9c]"
            }
            `}
      >
        <div className="-rotate-90 w-[84px] h-[34px] px-[13px] rounded-full border flex items-center gap-[4px]">
          <Handshake size={12} />{" "}
          <span className="text-[10px] font-semibold ">Contact</span>
        </div>
      </button>
    </nav>
  );
};

export default FooterNav;
