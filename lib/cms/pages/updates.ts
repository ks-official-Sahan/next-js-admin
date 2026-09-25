import { z } from "zod";
import { defineSection, text } from "../define";
import { long, str } from "../schema-parts";

// Sections of the updates page. Filled in by the page module of step 9.
// Each section's `defaults()` adapts the current `contents/updates.ts`.

export const updatesSections = {
  hero: defineSection({
    page: "updates",
    key: "hero",
    label: "Hero section",
    description: "Hero heading (two words with the second highlighted) and subtitle",
    schema: z.object({
      w1: str(50),
      w2: str(50),
      subtitle: long(200),
    }),
    fields: [
      text("w1", "First word of heading", { maxLength: 50, help: "e.g. Recent" }),
      text("w2", "Second word of heading (highlighted in color)", { maxLength: 50, help: "e.g. Updates" }),
      text("subtitle", "Subtitle", {
        maxLength: 200,
        help: "Tell visitors what they will find here.",
      }),
    ],
    defaults: () => ({
      w1: "Recent",
      w2: "Updates",
      subtitle: "Stay Updated with My Latest Work & Moments",
    }),
    consumers: ["/updates"],
  }),

  filters: defineSection({
    page: "updates",
    key: "filters",
    label: "Filters section",
    description: "Section titles for topics and tags filters. The icons stay in code.",
    schema: z.object({
      topicsTitle: str(50),
      tagsTitle: str(50),
    }),
    fields: [
      text("topicsTitle", "Topics filter title", { maxLength: 50, placeholder: "Topics" }),
      text("tagsTitle", "Tags filter title", { maxLength: 50, placeholder: "Tags" }),
    ],
    defaults: () => ({
      topicsTitle: "Topics",
      tagsTitle: "Tags",
    }),
    consumers: ["/updates"],
  }),
} as const;
