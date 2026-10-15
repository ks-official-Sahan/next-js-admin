import Icon, { type IconSpec } from "@/components/icons/Icon";
import type { PageContent } from "@/lib/cms/registry";
import { Site } from "@/config/site";
import { cn } from "@/lib/utils";
import React from "react";

interface ContactChannelsProps {
  content: PageContent<"home">["channels"];
  /** "tiles": compact icon tiles for the hero. "rows": big rows for the closing CTA. */
  variant: "tiles" | "rows";
  className?: string;
}

// Real links, not buttons that navigate: they open the app the visitor already
// uses (WhatsApp, Telegram, mail). The channel name is the accessible name;
// external ones also say they open a new tab.
const ContactChannels = ({ content: channels, variant, className }: ContactChannelsProps) => {
  const items = [
    {
      id: "whatsapp",
      ...channels.whatsApp,
      href: Site.whatsAppUrl,
      external: true,
      icon: { name: "whatsapp" } satisfies IconSpec,
    },
    {
      id: "telegram",
      ...channels.telegram,
      href: Site.telegramUrl,
      external: true,
      icon: { name: "brand-telegram" } satisfies IconSpec,
    },
    {
      id: "email",
      ...channels.email,
      href: `mailto:${Site.email}`,
      external: false,
      icon: { name: "mail-filled" } satisfies IconSpec,
    },
  ];

  return (
  <ul
    className={cn(
      variant === "tiles" ? "grid grid-cols-3 gap-2" : "flex flex-col gap-3",
      className
    )}
  >
    {items.map(({ id, label, detail, href, external, icon }) => (
      <li key={id}>
        <a
          href={href}
          {...(external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : undefined)}
          className={cn(
            "press lift arrow-nudge group flex rounded-[14px] border border-bBORDERFADE bg-bFCARD",
            variant === "tiles"
              ? "min-h-[76px] flex-col items-center justify-center gap-1.5 px-2 py-3 text-center"
              : "min-h-[72px] items-center gap-4 px-5 py-4"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full bg-bICON_FADE text-bICON",
              variant === "tiles" ? "h-9 w-9" : "h-11 w-11"
            )}
          >
            <Icon {...icon} size={variant === "tiles" ? 20 : 22} />
          </span>

          {variant === "tiles" ? (
            <span className="text-[13px] font-semibold leading-none">
              {label}
              {external && (
                <span className="sr-only"> {channels.newTab}</span>
              )}
            </span>
          ) : (
            <>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold">
                  {label}
                  {external && (
                    <span className="sr-only"> {channels.newTab}</span>
                  )}
                </span>
                <span className="truncate text-sm opacity-70">{detail}</span>
              </span>
              <Icon name="arrow-up-right" className="size-[18px] shrink-0 opacity-60" />
            </>
          )}
        </a>
      </li>
    ))}
  </ul>
  );
};

export default ContactChannels;
