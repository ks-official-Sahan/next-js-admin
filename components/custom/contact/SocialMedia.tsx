import type { PageContent } from "@/lib/cms/registry";
import LINKEDIN_ICON from "@/components/icons/Linkedin";
import X_ICON from "@/components/icons/twitter-X";
import HomeSection from "@/components/home/HomeSection";
import SectionHeading from "@/components/home/SectionHeading";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { ArrowUpRight } from "lucide-react";
import React from "react";

const icons = {
  github: <GitHubLogoIcon width={22} height={22} />,
  linkedin: <LINKEDIN_ICON className="fill-current" width={22} height={22} />,
  x: <X_ICON className="fill-current" width={20} height={20} />,
} as const;

interface SocialMediaProps {
  content: PageContent<"contact">;
}

// Plain links with names, not icon-only squares: people should know where a
// link goes before they tap it.
const SocialMedia = ({ content }: SocialMediaProps) => (
  <HomeSection id="social" labelledBy="social-title">
    <SectionHeading
      id="social-title"
      title={content.socials.title}
      description={content.socials.description}
    />

    <ul className="reveal mt-8 grid grid-cols-1 gap-3 s640:grid-cols-3">
      {content.socials.items.map((item) => (
        <li key={item.id}>
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="press lift arrow-nudge flex min-h-[72px] items-center gap-4 rounded-[16px] border border-bBORDERFADE bg-bCARD px-5"
          >
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bICON_FADE text-bICON"
            >
              {icons[item.id as keyof typeof icons]}
            </span>
            <span className="flex-1 text-[15px] font-semibold">
              {item.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </span>
            <ArrowUpRight
              size={18}
              aria-hidden="true"
              className="arrow-nudge-icon opacity-60"
            />
          </a>
        </li>
      ))}
    </ul>
  </HomeSection>
);

export default SocialMedia;
