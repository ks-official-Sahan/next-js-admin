import { z } from "zod";
import { HomeContent } from "@/contents/home";
import { defineSection } from "@/lib/cms/define";
import { str, long, linkSchema, items } from "@/lib/cms/schema-parts";

// Sections of the home page. Kept deliberately small: this is a minimal
// starter landing (headline, tagline, links to /updates and /contact), not a
// full marketing page. `channels`, `process` and `finalCta` are also read by
// the contact and updates pages (see components/pages/ContactPageView.tsx,
// UpdatesPageView.tsx), so they stay even though the home page itself only
// renders `hero`. Add more sections here as your landing page grows.

// Hero section
export const heroSection = defineSection({
  page: "home",
  key: "hero",
  label: "Hero",
  description: "Top section with status, headline, and primary actions",
  schema: z.object({
    status: str(50),
    title: str(100),
    subtitle: str(150),
    primary: linkSchema,
    secondary: linkSchema,
  }),
  fields: [
    { kind: "text", key: "status", label: "Status badge", maxLength: 50 },
    { kind: "text", key: "title", label: "Headline", maxLength: 100 },
    { kind: "text", key: "subtitle", label: "Tagline", maxLength: 150 },
    { kind: "link", key: "primary", label: "Primary button" },
    { kind: "link", key: "secondary", label: "Secondary button" },
  ],
  defaults: () => ({ ...HomeContent.hero }),
  consumers: ["/"],
  editPermission: "editPages",
  publishPermission: "publishPages",
});

// Channels (contact options) section — used by the home page's final CTA and
// the updates pages' closing CTA.
export const channelsSection = defineSection({
  page: "home",
  key: "channels",
  label: "Contact channels",
  description: "WhatsApp, Telegram, and Email direct links",
  schema: z.object({
    title: str(50),
    whatsApp: z.object({ label: str(20), detail: str(50) }),
    telegram: z.object({ label: str(20), detail: str(50) }),
    email: z.object({ label: str(20), detail: str(100) }),
    newTab: str(50),
  }),
  fields: [
    { kind: "text", key: "title", label: "Section title", maxLength: 50 },
    { kind: "group", key: "whatsApp", label: "WhatsApp channel", fields: [
      { kind: "text", key: "label", label: "Channel name", maxLength: 20 },
      { kind: "text", key: "detail", label: "Action text", maxLength: 50 },
    ]},
    { kind: "group", key: "telegram", label: "Telegram channel", fields: [
      { kind: "text", key: "label", label: "Channel name", maxLength: 20 },
      { kind: "text", key: "detail", label: "Action text", maxLength: 50 },
    ]},
    { kind: "group", key: "email", label: "Email channel", fields: [
      { kind: "text", key: "label", label: "Channel name", maxLength: 20 },
      { kind: "text", key: "detail", label: "Email address (Site.email interpolated at render time)", maxLength: 100 },
    ]},
    { kind: "text", key: "newTab", label: "Screen reader label for external links", maxLength: 50 },
  ],
  defaults: () => ({ ...HomeContent.channels }),
  consumers: ["/", "/updates"],
  editPermission: "editPages",
  publishPermission: "publishPages",
});

// Home nested section labels — only "process" is consumed today (by
// ProcessSection on the contact page). Add a group here alongside a new
// section if you bring back more of the home page.
const homeSectionLabelsSchema = z.object({
  process: z.object({ title: str(60), subtitle: long(150) }),
});

export const homeSectionLabelsDefinition = defineSection({
  page: "home",
  key: "home",
  label: "Section labels",
  description: "Headings and descriptions for shared sections (e.g. Process)",
  schema: homeSectionLabelsSchema,
  fields: [
    { kind: "group", key: "process", label: "Process section", fields: [
      { kind: "text", key: "title", label: "Section title", maxLength: 60 },
      { kind: "longtext", key: "subtitle", label: "Section description", maxLength: 150, rows: 2 },
    ]},
  ],
  defaults: () => ({ ...HomeContent.home }),
  consumers: ["/contact"],
  editPermission: "editPages",
  publishPermission: "publishPages",
});

// Process section (step-by-step project/onboarding flow)
const processStepSchema = z.object({
  title: str(40),
  body: long(200),
});

export const processSection = defineSection({
  page: "home",
  key: "process",
  label: "Process steps",
  description: "A short step-by-step flow, shown on the contact page",
  schema: z.object({
    steps: items(processStepSchema, 2, 8),
  }).strict(),
  fields: [
    { kind: "list", key: "steps", label: "Steps", itemLabel: "Step", min: 2, max: 8, fields: [
      { kind: "text", key: "title", label: "Step title", maxLength: 40 },
      { kind: "longtext", key: "body", label: "Step description", maxLength: 200, rows: 2 },
    ]},
  ],
  defaults: () => ({ ...HomeContent.process }),
  consumers: ["/contact"],
  editPermission: "editPages",
  publishPermission: "publishPages",
});

// Final CTA section
export const finalCtaSection = defineSection({
  page: "home",
  key: "finalCta",
  label: "Final CTA",
  description: "Closing call-to-action before contact channels",
  schema: z.object({
    title: str(100),
    subtitle: long(200),
    primary: linkSchema,
    copyLabel: str(40),
    copiedLabel: str(40),
  }),
  fields: [
    { kind: "text", key: "title", label: "Heading", maxLength: 100 },
    { kind: "longtext", key: "subtitle", label: "Description", maxLength: 200, rows: 2 },
    { kind: "link", key: "primary", label: "Button" },
    { kind: "text", key: "copyLabel", label: "Copy email button label", maxLength: 40 },
    { kind: "text", key: "copiedLabel", label: "Copy confirmation label", maxLength: 40 },
  ],
  defaults: () => ({ ...HomeContent.finalCta }),
  consumers: ["/", "/updates"],
  editPermission: "editPages",
  publishPermission: "publishPages",
});

// Export all sections for the registry
export const homeSections = {
  hero: heroSection,
  channels: channelsSection,
  home: homeSectionLabelsDefinition,
  process: processSection,
  finalCta: finalCtaSection,
};
