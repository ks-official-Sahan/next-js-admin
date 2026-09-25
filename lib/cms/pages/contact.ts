import { z } from "zod";
import { defineSection, group, link, list, longtext, stringList, text } from "../define";
import { href, items, linkSchema, long, optStr, str, strings } from "../schema-parts";

// Sections of the contact page (design notes, section 8).

const heroSchema = z.object({
  status: str(100),
  title: str(80),
  description: str(200),
});

const formFieldSchema = z.object({
  label: str(60),
  placeholder: optStr(80),
});

const unique = function (values: string[]) {
  return new Set(values.map(function (value) { return value.trim().toLowerCase(); })).size === values.length;
};

const channelSchema = z.object({
  id: z.enum(["email", "whatsapp"]),
  label: str(40),
});

const validationSchema = z.object({
  name: z.object({
    required: str(100),
  }),
  email: z.object({
    required: str(100),
    format: str(100),
  }),
  message: z.object({
    minLength: str(100),
  }),
});

const formSchema = z.object({
  title: str(60),
  intro: str(300),
  channels: items(channelSchema, 2, 2).refine(function (list) { return unique(list.map(function (item) { return item.id; })); }, "Each channel must be different"),
  topicOptions: strings(1, 10, 40).refine(unique, "Each topic must be different"),
  fields: z.object({
    name: formFieldSchema,
    email: formFieldSchema,
    topic: formFieldSchema,
    message: z.object({
      label: str(60),
      placeholder: optStr(80),
    }),
  }),
  validation: validationSchema,
  legend: str(60),
  submitButtonText: str(40),
  copyButtonText: str(40),
  copiedButtonText: str(40),
  statusOpened: str(300),
  statusCopied: str(200),
});

const tipsSchema = z.object({
  title: str(80),
  items: strings(1, 10, 150),
});

const socialItemSchema = z.object({
  id: z.enum(["github", "linkedin", "x"]),
  label: str(40),
  href,
});

const socialsSchema = z.object({
  title: str(80),
  description: str(200),
  items: items(socialItemSchema, 3, 3).refine(function (list) { return unique(list.map(function (item) { return item.id; })); }, "Each link must be different"),
});

export const contactSections = {
  hero: defineSection({
    page: "contact",
    key: "hero",
    label: "Hero section",
    description: "Status badge, title, and description at the top of the page",
    schema: heroSchema,
    fields: [
      text("status", "Status badge", { maxLength: 100 }),
      text("title", "Page title", { maxLength: 80 }),
      longtext("description", "Page description", { maxLength: 200 }),
    ],
    consumers: ["/contact"],
    defaults: () => ({
      status: "Replies come from me, not a bot",
      title: "Let's talk about what you want to build.",
      description:
        "Tell me a little about it, or just say hi. Pick whichever channel is easiest for you.",
    }),
  }),

  form: defineSection({
    page: "contact",
    key: "form",
    label: "Contact form",
    description: "Form title, fields, validation messages, and channel options",
    schema: formSchema,
    fixedKeys: ["channels[0].id", "channels[1].id"],
    fields: [
      text("title", "Form heading", { maxLength: 60 }),
      longtext("intro", "Form introduction", { maxLength: 300, rows: 3 }),
      list("channels", "Channel options", {
        itemLabel: "Channel",
        fields: [
          text("label", "Label", { maxLength: 40 }),
        ],
        min: 2,
        max: 2,
      }),
      stringList("topicOptions", "Topic options", {
        itemLabel: "Topic",
        maxLength: 40,
        min: 1,
        max: 10,
      }),
      group(
        "fields",
        "Field labels and placeholders",
        [
          group("name", "Name field", [
            text("label", "Label", { maxLength: 60 }),
            text("placeholder", "Placeholder", { maxLength: 80, required: false }),
          ]),
          group("email", "Email field", [
            text("label", "Label", { maxLength: 60 }),
            text("placeholder", "Placeholder", { maxLength: 80, required: false }),
          ]),
          group("topic", "Topic field", [
            text("label", "Label", { maxLength: 60 }),
            text("placeholder", "Placeholder", { maxLength: 80, required: false }),
          ]),
          group("message", "Message field", [
            text("label", "Label", { maxLength: 60 }),
            text("placeholder", "Placeholder", { maxLength: 80, required: false }),
          ]),
        ]
      ),
      group("validation", "Validation error messages", [
        group("name", "Name validation", [
          text("required", "Required error", { maxLength: 100 }),
        ]),
        group("email", "Email validation", [
          text("required", "Required error", { maxLength: 100 }),
          text("format", "Format error", { maxLength: 100 }),
        ]),
        group("message", "Message validation", [
          text("minLength", "Too short error", { maxLength: 100 }),
        ]),
      ]),
      text("legend", "Channel choice label", { maxLength: 60 }),
      text("submitButtonText", "Submit button text", { maxLength: 40 }),
      text("copyButtonText", "Copy button text", { maxLength: 40 }),
      text("copiedButtonText", "Copied button text", { maxLength: 40 }),
      longtext("statusOpened", "Status when app opens", { maxLength: 300, rows: 2 }),
      longtext("statusCopied", "Status when copied", { maxLength: 200, rows: 2 }),
    ],
    consumers: ["/contact"],
    defaults: () => ({
      title: "Send a message",
      intro:
        "This opens your own email or WhatsApp with the message already written. Nothing is sent until you press send there.",
      channels: [
        { id: "email" as const, label: "Email" },
        { id: "whatsapp" as const, label: "WhatsApp" },
      ],
      topicOptions: ["Project", "Idea", "Just saying hi"],
      fields: {
        name: {
          label: "Your name",
          placeholder: "",
        },
        email: {
          label: "Your email",
          placeholder: "you@example.com",
        },
        topic: {
          label: "What is this about?",
          placeholder: "",
        },
        message: {
          label: "Your message",
          placeholder: "",
        },
      },
      validation: {
        name: {
          required: "Please tell me your name.",
        },
        email: {
          required: "Please add your email address.",
          format: "That email address does not look right.",
        },
        message: {
          minLength: "A sentence or two helps me reply properly.",
        },
      },
      legend: "Send it with",
      submitButtonText: "Prepare my message",
      copyButtonText: "Copy message",
      copiedButtonText: "Copied",
      statusOpened:
        "Your app should be open with the message ready. Press send there to finish. If nothing opened, use Copy message and paste it anywhere.",
      statusCopied: "Message copied. Paste it into any chat or email.",
    }),
  }),

  tips: defineSection({
    page: "contact",
    key: "tips",
    label: "Tips section",
    description: "What to include in a message",
    schema: tipsSchema,
    fields: [
      text("title", "Section title", { maxLength: 80 }),
      stringList("items", "Tip items", {
        itemLabel: "Tip",
        maxLength: 150,
        multiline: true,
        min: 1,
        max: 10,
      }),
    ],
    consumers: ["/contact"],
    defaults: () => ({
      title: "A good first message includes",
      items: [
        "What you want built, in a sentence or two",
        "Who it is for, and where it will run (web, Android, iOS)",
        "Any deadline, and a rough budget if you have one",
      ],
    }),
  }),

  socials: defineSection({
    page: "contact",
    key: "socials",
    label: "Social media links",
    description: "Links at the bottom of the contact page",
    schema: socialsSchema,
    fixedKeys: ["items[0].id", "items[1].id", "items[2].id"],
    fields: [
      text("title", "Section title", { maxLength: 80 }),
      longtext("description", "Section description", { maxLength: 200 }),
      list("items", "Social links", {
        itemLabel: "Link",
        fields: [
          text("label", "Label", { maxLength: 40 }),
          text("href", "URL", { maxLength: 500 }),
        ],
        min: 3,
        max: 3,
      }),
    ],
    consumers: ["/contact"],
    defaults: () => ({
      title: "Find us elsewhere",
      description: "Code, updates and the occasional thought.",
      items: [
        {
          id: "github" as const,
          label: "GitHub",
          href: "https://github.com/your-org",
        },
        {
          id: "linkedin" as const,
          label: "LinkedIn",
          href: "https://www.linkedin.com/company/your-org",
        },
        {
          id: "x" as const,
          label: "X",
          href: "https://x.com/your_org",
        },
      ],
    }),
  }),
} as const;
