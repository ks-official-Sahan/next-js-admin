"use client";

import HeroBackdrop from "@/components/home/HeroBackdrop";
import { HomeContainer, stagger } from "@/components/home/HomeSection";
import UpdatesExplorer, { type UpdatesListPost } from "@/components/updates/UpdatesExplorer";
import type { PageContent } from "@/lib/cms/registry";
import { Rss } from "lucide-react";
import React, { ReactNode } from "react";

interface UpdatesPageViewProps {
  content: PageContent<"updates">;
  posts: UpdatesListPost[];
  finalCta: ReactNode;
}

export default function UpdatesPageView({ content, posts, finalCta }: UpdatesPageViewProps) {
  return (
    <div className="w-full overflow-hidden font-medium">
      <section aria-labelledby="updates-title" className="w-full">
        <HeroBackdrop>
          <div className="flex pb-[clamp(2.5rem,5vw,4rem)] pt-[clamp(6.5rem,12vw,9rem)]">
            <HomeContainer>
              <div className="flex flex-col items-start gap-6">
                <h1
                  id="updates-title"
                  style={stagger(0)}
                  className="hero-rise max-w-[16ch] text-balance text-[length:clamp(2.25rem,1.1rem+4.6vw,5rem)] font-semibold leading-[1.04] tracking-[-0.03em]"
                >
                  {content.hero.w1}{" "}
                  <span className="text-bICON">{content.hero.w2}</span>
                </h1>
                <p
                  style={stagger(1)}
                  className="hero-rise max-w-[52ch] text-[length:clamp(1.05rem,0.9rem+0.5vw,1.3rem)] leading-relaxed opacity-70"
                >
                  {content.hero.subtitle}
                </p>
                <a
                  href="/rss.xml"
                  style={stagger(2)}
                  className="hero-rise inline-flex items-center gap-2 rounded-full border border-bBORDERFADE bg-bCHIP px-3 py-1.5 text-xs font-medium opacity-80 transition-opacity hover:opacity-100"
                >
                  <Rss size={14} aria-hidden="true" />
                  RSS feed
                </a>
              </div>
            </HomeContainer>
          </div>
        </HeroBackdrop>
      </section>

      <UpdatesExplorer content={content} posts={posts} />
      {finalCta}
    </div>
  );
}
