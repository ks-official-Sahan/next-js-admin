import "server-only";

import { SiteMetadata } from "@/config/site";
import { getEnv } from "@/lib/env";

/** Absolute links in emails: SITE_URL, else the public site URL of config/site.ts. */
export function siteUrl(): string {
  return (getEnv().SITE_URL ?? SiteMetadata.siteUrl).replace(/\/+$/, "");
}

export const absoluteUrl = (path: string): string => `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
