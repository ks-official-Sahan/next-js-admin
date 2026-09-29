import type { ChatSite } from "@sahan-sac/chat-kit/types";

import { Site, SiteMetadata } from "@/config/site";

/** The owner identity the chatbot speaks for, mapped once from config/site.ts. */
export const chatSite: ChatSite = {
  author: Site.author,
  authorFullName: Site.authorFullName,
  role: Site.myRole,
  company: Site.companyRole,
  location: Site.location,
  tagline: Site.tagline,
  email: Site.email,
  phoneDisplay: Site.phoneDisplay,
  gitHubUrl: Site.gitHubUrl,
  siteUrl: SiteMetadata.siteUrl,
  description: SiteMetadata.description,
  scope: "this site, its updates",
  linkExample: "[Post Title](/updates/post-slug) when referencing site content",
};
