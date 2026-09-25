import type { Metadata } from "next";

import ChatWidgetLoader from "@/components/site/chat/ChatWidgetLoader";
import SiteShell from "@/components/site/SiteShell";
import { SiteMetadata } from "@/config/site";
import { RSS_ALTERNATES } from "@/lib/metadata";
import { getSetting } from "@/lib/settings/service";

// Site-only metadata. Everything else (title, description, openGraph, twitter,
// robots, metadataBase) comes from the root layout, so the merged head of every
// public page matches what it was before the route groups existed.
export const metadata: Metadata = {
  authors: [{ name: SiteMetadata.author, url: SiteMetadata.siteUrl }],
  creator: SiteMetadata.author,
  keywords: [SiteMetadata.title, "Admin platform", "Next.js", "Content management"],
  alternates: {
    canonical: SiteMetadata.siteUrl,
    types: RSS_ALTERNATES,
  },
};

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [features, chatbotConfig] = await Promise.all([
    getSetting("features"),
    getSetting("chatbot.config"),
  ]);

  return (
    <SiteShell>
      {children}
      {features.chatbotEnabled && (
        <ChatWidgetLoader enabled config={chatbotConfig} siteUrl={SiteMetadata.siteUrl} />
      )}
    </SiteShell>
  );
}
