"use client";

import type { PageContent } from "@/lib/cms/registry";
import ContactDetailsCard from "@/components/contact/ContactDetailsCard";
import ContactForm from "@/components/contact/ContactForm";
import SocialMedia from "@/components/custom/contact/SocialMedia";
import HeroBackdrop from "@/components/home/HeroBackdrop";
import { HomeContainer, stagger } from "@/components/home/HomeSection";
import ProcessSection from "@/components/home/ProcessSection";
import { Site } from "@/config/site";
import { IconBrandTelegram, IconBrandWhatsapp } from "@tabler/icons-react";
import { Mail, MapPin, Phone } from "lucide-react";
import React from "react";

interface ContactPageViewProps {
  content: PageContent<"contact">;
  home: PageContent<"home">;
}

const ContactPageView = ({ content, home }: ContactPageViewProps) => {
  return (
    <div className="w-full overflow-hidden font-medium">
      <section aria-labelledby="contact-title" className="w-full">
        <HeroBackdrop>
          <div className="flex pb-[clamp(2.5rem,5vw,4rem)] pt-[clamp(6.5rem,12vw,9rem)]">
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
                  {content.hero.status}
                </p>
                <h1
                  id="contact-title"
                  style={stagger(1)}
                  className="hero-rise max-w-[20ch] text-balance text-[length:clamp(2.25rem,1.1rem+4.6vw,5rem)] font-semibold leading-[1.04] tracking-[-0.03em]"
                >
                  {content.hero.title}
                </h1>
                <p
                  style={stagger(2)}
                  className="hero-rise max-w-[52ch] text-[length:clamp(1.05rem,0.9rem+0.5vw,1.3rem)] leading-relaxed opacity-70"
                >
                  {content.hero.description}
                </p>
              </div>
            </HomeContainer>
          </div>
        </HeroBackdrop>
      </section>

      <section aria-label="Contact details and form" className="w-full">
        <HomeContainer>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-8">
            <div className="flex flex-col gap-3">
              <ContactDetailsCard
                copy
                href={`mailto:${Site.email}`}
                icon={<Mail size={20} />}
                title="Email"
                value={Site.email}
              />
              <ContactDetailsCard
                copy
                href={`tel:${Site.phone}`}
                icon={<Phone size={20} />}
                title="Phone"
                value={Site.phone}
                displayValue={Site.phoneDisplay}
              />
              <ContactDetailsCard
                external
                href={Site.whatsAppUrl}
                icon={<IconBrandWhatsapp size={20} />}
                title="WhatsApp"
                value={Site.phone}
                displayValue="Chat now"
              />
              <ContactDetailsCard
                external
                href={Site.telegramUrl}
                icon={<IconBrandTelegram size={20} />}
                title="Telegram"
                value={Site.phone}
                displayValue="Message me"
              />
              <ContactDetailsCard
                icon={<MapPin size={20} />}
                title="Location"
                value={Site.location}
              />

              <div className="mt-2 rounded-[16px] border border-bBORDERFADE bg-bCARD p-6">
                <h2 className="text-base font-semibold">{content.tips.title}</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed opacity-80">
                  {content.tips.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <ContactForm content={content} />
          </div>
        </HomeContainer>
      </section>

      <SocialMedia content={content} />
      <ProcessSection content={home.process} labels={home.home} />
      <div className="pb-[clamp(4rem,8vw,7rem)]" />
    </div>
  );
};

export default ContactPageView;
