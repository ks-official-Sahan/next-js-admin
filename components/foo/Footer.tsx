import React from "react";
import WrapperBody from "@/components/wrappers/WrapperBody";
import { TextHoverEffect } from "@/components/ui/text-hover-effect";
import { Site } from "@/config/site";
import FooterNav from "@/components/foo/FooterNav";

const Footer = () => {
  return (
    <footer className="z-[1000] flex w-full flex-col items-center border-t border-[#0000001f] dark:border-[#ffffff1f] pt-[40px] pb-[80px] bg-[#f7f7f73f] dark:bg-[#1A1A1A] backdrop-blur-sm absolute bottom-0 px-4">
      <WrapperBody>
        <div className="w-full flex justify-between items-center">
          <div className="flex flex-col">
            <div className="text-xl font-bold uppercase">{Site.siteName}</div>
            <div className="text-[12px] font-medium pt-[60px] opacity-65">
              &copy; {new Date().getFullYear()} {Site.org}
            </div>
          </div>

          <div className="sm:hidden w-[511px]">
            <TextHoverEffect text={Site.fooTxt} />
          </div>

          <FooterNav />
        </div>
      </WrapperBody>
    </footer>
  );
};

export default Footer;
