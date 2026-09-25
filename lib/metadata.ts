import type { Metadata } from "next";
import { SiteMetadata } from "@/config/site";

// Feed discovery (<link rel="alternate" type="application/rss+xml">). Next
// merges `alternates` shallowly, so every segment that sets a canonical must
// repeat this or the feed link disappears from its pages.
export const RSS_ALTERNATES: NonNullable<Metadata["alternates"]>["types"] = {
  "application/rss+xml": [{ url: `${SiteMetadata.siteUrl}/rss.xml`, title: `${SiteMetadata.author} — Updates` }],
};

export function pageMetadata(
  path: string,
  { title, description }: { title: string; description: string }
): Metadata {
  const url = `${SiteMetadata.siteUrl}${path}`;

  return {
    title,
    description,
    alternates: { canonical: url, types: RSS_ALTERNATES },
    openGraph: {
      type: "website",
      siteName: SiteMetadata.ogSiteName,
      url,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      creator: SiteMetadata.twitterUsername,
      title,
      description,
    },
  };
}
