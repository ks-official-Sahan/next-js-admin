"use client";

import { cn } from "@/lib/utils";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

interface ContactDetailsCardProps {
  title: string;
  value: string;
  displayValue?: string;
  icon: React.ReactNode;
  /** Adds a copy button with inline confirmation. */
  copy?: boolean;
  /** Makes the whole row a link (mailto:, tel:, https:). */
  href?: string;
  external?: boolean;
}

// One line of contact info. Copy confirms in place (icon swap + a polite
// announcement) instead of an alert, and never fails loudly: if the clipboard
// is blocked the value is still on screen to select.
const ContactDetailsCard = ({
  title,
  value,
  displayValue,
  icon,
  copy = false,
  href,
  external = false,
}: ContactDetailsCardProps) => {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeout.current) clearTimeout(timeout.current);
    },
    []
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(false), 2000);
  };

  const body = (
    <>
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bICON_FADE text-bICON"
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm opacity-70">{title}</span>
        <span className="truncate text-[15px] font-semibold">
          {displayValue ?? value}
        </span>
      </span>
    </>
  );

  return (
    <div className="flex min-h-[72px] items-center gap-3 rounded-[14px] border border-bBORDERFADE bg-bFCARD px-4 py-3">
      {href ? (
        <a
          href={href}
          {...(external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : undefined)}
          className={cn(
            "press arrow-nudge flex min-w-0 flex-1 items-center gap-3"
          )}
        >
          {body}
          <ArrowUpRight
            size={16}
            aria-hidden="true"
            className="arrow-nudge-icon shrink-0 opacity-60"
          />
          {external && <span className="sr-only"> (opens in a new tab)</span>}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}

      {copy && (
        <>
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${title.toLowerCase()}`}
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-bBORDERFADE bg-bCARD"
          >
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
          </button>
          <span role="status" className="sr-only">
            {copied ? `${title} copied` : ""}
          </span>
        </>
      )}
    </div>
  );
};

export default ContactDetailsCard;
