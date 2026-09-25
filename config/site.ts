// Site identity and contact details, all in one place so a new owner edits
// exactly one file after scaffolding with `create-admin`. Every value below
// is a neutral placeholder — swap them for your own before deploying.
const PHONE = "+10000000000";

export const Site = {
  siteName: "Acme",
  fooTxt: "Acme.",
  gitHubUser: "@your-org",
  tagline: "Built with the Admin Template",
  gitHubUrl: "https://github.com/your-org",
  author: "Owner",
  authorFullName: "Site Owner",
  email: "owner@example.com",
  phone: PHONE,
  phoneDisplay: "+1 000-000-0000",
  location: "Remote",
  org: "Acme Inc",
  orgUrl: "https://example.com",
  myRole: "Team",
  companyRole: "Team at Acme Inc",
  // Both links are built from the phone number. Swap `telegramUrl` for a
  // https://t.me/<username> link if a public Telegram username exists.
  whatsAppUrl: `https://wa.me/${PHONE.replace(/\D/g, "")}?text=${encodeURIComponent(
    "Hi, I found your site and would like to talk about a project."
  )}`,
  telegramUrl: `https://t.me/${PHONE}`,
};

export const SiteMetadata = {
  title: "Acme",
  description: "Admin platform starter — content, blog, media, and CRM in one place.",
  author: "Acme",
  siteUrl: "http://localhost:3000",
  githubUsername: "your-org",
  twitterUsername: "@your_org",
  ogSiteName: "Acme",
  legalName: "Acme Inc",
};

export const PageMetadata = {
  updates: {
    title: "Updates",
    description:
      "Release notes and news — a running log of what shipped and what changed, posted as progress happens.",
  },
  contact: {
    title: "Contact",
    description: "Get in touch about a project, an idea, or just to say hi.",
  },
};
