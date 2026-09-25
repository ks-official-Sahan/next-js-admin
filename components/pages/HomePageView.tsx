import React from "react";
import Link from "next/link";
import type { PageContent } from "@/lib/cms/registry";
import HeroBackdrop from "@/components/home/HeroBackdrop";
import { HomeContainer, stagger } from "@/components/home/HomeSection";
import { ArrowUpRight } from "lucide-react";

interface HomePageViewProps {
  content: PageContent<"home">;
}

// Minimal starter landing: status badge, headline, tagline, and two links
// (updates, contact). Add sections here as your product grows — the CMS
// already carries `channels`, `process` and `finalCta` for you to reuse
// (see lib/cms/pages/home.ts).
export default function HomePageView({ content }: HomePageViewProps) {
  const { hero } = content;

  return (
    <section aria-labelledby="home-title" className="w-full">
      <HeroBackdrop>
        <div className="flex min-h-[70vh] flex-col justify-center pb-[clamp(3rem,8vw,6rem)] pt-[clamp(7rem,14vw,10rem)]">
          <HomeContainer>
            <div className="flex flex-col items-start gap-6">
              <p
                style={stagger(0)}
                className="hero-rise inline-flex items-center gap-3 rounded-full border border-bBORDERFADE bg-bCHIP py-2 pl-3 pr-4 text-sm font-medium"
              >
                <span
                  aria-hidden="true"
                  className="status-ping relative h-2.5 w-2.5 rounded-full bg-bICON text-bICON"
                />
                {hero.status}
              </p>
              <h1
                id="home-title"
                style={stagger(1)}
                className="hero-rise max-w-[20ch] text-balance text-[length:clamp(2.5rem,1.1rem+5vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.03em]"
              >
                {hero.title}
              </h1>
              <p
                style={stagger(2)}
                className="hero-rise max-w-[52ch] text-[length:clamp(1.05rem,0.9rem+0.5vw,1.3rem)] leading-relaxed opacity-70"
              >
                {hero.subtitle}
              </p>

              <div
                style={stagger(3)}
                className="hero-rise flex w-full flex-col gap-3 s480:w-auto s480:flex-row s480:items-center"
              >
                <Link
                  href={hero.primary.href}
                  className="press arrow-nudge inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-bCHIPSELECTED px-7 text-[15px] font-semibold text-white dark:text-black"
                >
                  {hero.primary.label}
                  <ArrowUpRight size={18} aria-hidden="true" className="arrow-nudge-icon" />
                </Link>
                <Link
                  href={hero.secondary.href}
                  className="press inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-bBORDERFADE bg-bFCARD px-6 text-[15px] font-semibold"
                >
                  {hero.secondary.label}
                </Link>
              </div>
            </div>
          </HomeContainer>
        </div>
      </HeroBackdrop>
    </section>
  );
}
