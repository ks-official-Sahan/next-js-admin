"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { ignorePageView } from "@sahan-sac/analytics-kit/client";

// On a not-found page: the URL is not a page of this site, so the beacon
// (PageViewBeacon) leaves it out of the counts and "Top pages".
export default function NotCounted() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) ignorePageView(pathname);
  }, [pathname]);

  return null;
}
