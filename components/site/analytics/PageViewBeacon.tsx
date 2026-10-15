"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { trackPageView } from "@sahan-sac/analytics-kit/client";

// One page view per route change (@sahan-sac/analytics-kit/client): no
// cookie, no storage, no third party, nothing when the browser asks not to be
// tracked. Preview routes are never counted.
export default function PageViewBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname && !pathname.startsWith("/preview")) trackPageView(pathname);
  }, [pathname]);

  return null;
}
