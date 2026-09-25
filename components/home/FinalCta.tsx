"use client";

import ContactChannels from "@/components/home/ContactChannels";
import HomeSection from "@/components/home/HomeSection";
import type { PageContent } from "@/lib/cms/registry";
import { Site, SiteMetadata } from "@/config/site";
import { getShareUrl } from "@/lib/client/domain-check";
import { ArrowUpRight, Check, Copy, Share2 } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

// The closing section is a contact hub: the primary path (a project brief)
// plus the three channels people already use. Choosing the channel is the
// friction cut; nobody has to open a form to say hello.

interface FinalCtaProps {
  content: PageContent<"home">["finalCta"];
  channels: PageContent<"home">["channels"];
}

const FinalCta = ({ content: finalCta, channels }: FinalCtaProps) => {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    []
  );

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(Site.email);
    } catch {
      // Clipboard can be blocked; the address is a visible mailto link, so
      // the visitor can still reach it.
      return;
    }
    setCopied(true);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(false), 2000);
  };

  // Word of mouth is the cheapest marketing there is, so make passing it on
  // one tap: the native share sheet where it exists, a copied link
  // everywhere else.
  const [linkCopied, setLinkCopied] = useState(false);
  const linkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (linkTimeout.current) clearTimeout(linkTimeout.current);
    },
    []
  );

  const shareSite = async () => {
    try {
      const shareUrl = getShareUrl();
      if (navigator.share) {
        await navigator.share({
          title: SiteMetadata.title,
          text: `${SiteMetadata.title}, ${Site.myRole}`,
          url: shareUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // The share sheet was dismissed or the clipboard is blocked: nothing to
      // confirm, and nothing was lost.
      return;
    }
    setLinkCopied(true);
    if (linkTimeout.current) clearTimeout(linkTimeout.current);
    linkTimeout.current = setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <HomeSection
      id="contact-cta"
      labelledBy="cta-title"
      className="pb-[clamp(4rem,8vw,7rem)]"
    >
      <div className="reveal relative overflow-hidden rounded-[20px] border border-bBORDERFADE bg-bCARD">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        >
          <div className="hero-glow absolute -inset-[20%] opacity-80" />
          <div className="hero-grid absolute inset-0 opacity-60" />
        </div>

        <div className="relative grid grid-cols-1 items-center gap-10 p-[clamp(1.5rem,5vw,4rem)] lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div className="flex flex-col items-start gap-8">
            <h2
              id="cta-title"
              className="max-w-[16ch] text-balance text-[length:clamp(2rem,1.2rem+3.2vw,3.75rem)] font-semibold leading-[1.06] tracking-[-0.03em] s768:max-w-[22ch] lg:max-w-[14ch]"
            >
              {finalCta.title}
            </h2>
            <p className="max-w-[46ch] text-base leading-relaxed opacity-70 lg:text-lg">
              {finalCta.subtitle}
            </p>

            <div className="flex w-full flex-col gap-3 s480:w-auto s480:flex-row s480:items-center">
              <Link
                href={finalCta.primary.href}
                className="press arrow-nudge inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-bCHIPSELECTED px-7 text-[15px] font-semibold text-white dark:text-black"
              >
                {finalCta.primary.label}
                <ArrowUpRight
                  size={18}
                  aria-hidden="true"
                  className="arrow-nudge-icon"
                />
              </Link>

              <button
                type="button"
                onClick={copyEmail}
                className="press inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-bBORDERFADE bg-bFCARD px-6 text-[15px] font-semibold"
              >
                {copied ? (
                  <Check size={18} aria-hidden="true" />
                ) : (
                  <Copy size={18} aria-hidden="true" />
                )}
                {copied ? finalCta.copiedLabel : finalCta.copyLabel}
              </button>
              <span role="status" className="sr-only">
                {copied ? finalCta.copiedLabel : ""}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold opacity-70">
              {channels.title}
            </h3>
            <ContactChannels content={channels} variant="rows" />
            <button
              type="button"
              onClick={shareSite}
              className="press mt-1 inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-2 text-sm font-medium opacity-80 hover:opacity-100"
            >
              {linkCopied ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Share2 size={16} aria-hidden="true" />
              )}
              {linkCopied ? "Link copied" : "Know someone who'd like this? Share it"}
            </button>
            <span role="status" className="sr-only">
              {linkCopied ? "Link copied" : ""}
            </span>
          </div>
        </div>
      </div>
    </HomeSection>
  );
};

export default FinalCta;
