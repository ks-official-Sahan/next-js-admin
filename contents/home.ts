import { Site } from "@/config/site";

// Default/fallback content for the home page's CMS sections
// (lib/cms/pages/home.ts). Edited from /admin/content/home once the app is
// running; these are just the values a fresh install starts with.

export const HomeContent = {
  hero: {
    status: "Admin platform starter",
    title: `Welcome to ${Site.siteName}.`,
    subtitle: `${Site.myRole} at ${Site.org}.`,
    primary: { label: "See updates", href: "/updates" },
    secondary: { label: "Get in touch", href: "/contact" },
  },
  // Direct lines. Hrefs come from Site so there is one place to edit them.
  channels: {
    title: "Say hello",
    whatsApp: { label: "WhatsApp", detail: "Chat now" },
    telegram: { label: "Telegram", detail: "Message us" },
    email: { label: "Email", detail: Site.email },
    newTab: "(opens in a new tab)",
  },
  home: {
    process: {
      title: "How it works",
      subtitle: "A short, predictable flow from first message to done.",
    },
  },
  process: {
    steps: [
      {
        title: "Get in touch",
        body: "Send a short description of what you need. We reply with questions and a rough scope.",
      },
      {
        title: "Agree the plan",
        body: "We settle scope and timing before anything starts, so there are no surprises later.",
      },
      {
        title: "Build in the open",
        body: "You see progress early and often, not one big reveal at the end.",
      },
      {
        title: "Ship and support",
        body: "We deploy it and stay available for fixes and next steps.",
      },
    ],
  },
  finalCta: {
    title: "Have something you need built?",
    subtitle: "Tell us what you are working on. We can talk through scope, timing and next steps.",
    primary: { label: "Start a conversation", href: "/contact" },
    copyLabel: "Copy email",
    copiedLabel: "Email copied",
  },
};
