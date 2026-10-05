import { CHAT_TONES } from "@sahan-sac/chat-kit/types";
import { z } from "zod";

// Settings schema with zod validation and defaults. Each key can be stored or
// retrieved independently. All schemas must declare their types so getSettings
// and updateSetting can be type-safe. Design notes, Step 16.

// Features: feature flag switches for gradual rollouts. Maintenance has its
// own dedicated "maintenance" key below (the one the proxy actually reads),
// so it is deliberately not duplicated here: a flag here that looked like it
// controlled maintenance but did not would be a trap for whoever edits it.
export const featuresSchema = z.object({
  // Whether the chatbot widget mounts on the public site at all. Distinct
  // from chatbot.config.enabled, which governs whether the mounted widget
  // answers (a maintenance-style pause without hiding the widget entirely).
  chatbotEnabled: z.boolean().default(true),
  readMoreEnabled: z.boolean().default(true),
});
export type Features = z.infer<typeof featuresSchema>;

// Maintenance: toggle and metadata
export const maintenanceSchema = z.object({
  enabled: z.boolean().default(false),
  reason: z.string().default("Site under maintenance. Please try again later."),
  estimatedEndTime: z.string().datetime().optional(), // ISO 8601
});
export type Maintenance = z.infer<typeof maintenanceSchema>;

// Security: IP allowlist for admin access
export const ipAllowlistSchema = z.object({
  enabled: z.boolean().default(false),
  ips: z.array(z.string()).default([]), // IPv4, IPv6, CIDR notation
  description: z.string().default(""),
});
export type IpAllowlist = z.infer<typeof ipAllowlistSchema>;

// Chatbot: configuration for the chatbot widget
export const chatbotConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tone: z.enum(CHAT_TONES).default("professional"),
  greeting: z.string().default("Hi! How can I help you today?"),
  trainingDataVersion: z.number().default(0),
});
export type ChatbotConfig = z.infer<typeof chatbotConfigSchema>;

// Email: routing configuration
export const emailRoutingSchema = z.object({
  inboxEmail: z.string().email().optional(),
  notificationEmail: z.string().email().optional(),
  autoReplyEnabled: z.boolean().default(true),
  // Send a redacted copy (no links) of account emails to EMAIL_CC. Off has no
  // effect while EMAIL_CC is empty (lib/email/account-mail.ts).
  authCopyEnabled: z.boolean().default(true),
});
export type EmailRouting = z.infer<typeof emailRoutingSchema>;

// AI: standing guidance the owner writes for the models (voice, facts, do and
// don't). Global applies everywhere, then each feature's own is added after
// it (lib/ai/context.ts). Appended after each prompt's fixed rules, so it
// steers but never overrides them (@sahan-sac/ai-core/guard guidanceSection).
export const AI_CONTEXT_SCOPES = ["global", "blog", "seo", "chatbot"] as const;
export type AiContextScope = (typeof AI_CONTEXT_SCOPES)[number];
export const MAX_AI_CONTEXT_LENGTH = 6000;
const aiContextText = z.string().trim().max(MAX_AI_CONTEXT_LENGTH, `Use at most ${MAX_AI_CONTEXT_LENGTH} characters.`).default("");
export const aiContextSchema = z.object({
  global: aiContextText,
  blog: aiContextText,
  seo: aiContextText,
  chatbot: aiContextText,
});
export type AiContext = z.infer<typeof aiContextSchema>;

// RBAC: seed version for tracking permission matrix changes
export const rbacSeedVersionSchema = z.object({
  version: z.number().default(1),
  lastUpdated: z.string().datetime().optional(),
});
export type RbacSeedVersion = z.infer<typeof rbacSeedVersionSchema>;

// SEO: llms.txt content, regenerated on demand from real site data and
// persisted here (not the filesystem — Vercel's runtime filesystem is
// read-only outside /tmp, so writing to public/llms.txt from a Server
// Action would throw on every deploy). /llms.txt falls back to generating
// it on the fly when nobody has regenerated it yet, so it is never a 404.
export const llmsTxtSchema = z.object({
  content: z.string().default(""),
  generatedAt: z.string().datetime().optional(),
});
export type LlmsTxt = z.infer<typeof llmsTxtSchema>;

// Union of all setting keys and their schemas
export const SETTING_SCHEMAS = {
  "features": featuresSchema,
  "maintenance": maintenanceSchema,
  "security.ipAllowlist": ipAllowlistSchema,
  "chatbot.config": chatbotConfigSchema,
  "email.routing": emailRoutingSchema,
  "ai.context": aiContextSchema,
  "rbac.seedVersion": rbacSeedVersionSchema,
  "seo.llmsTxt": llmsTxtSchema,
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SettingValueOf<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

export const isSettingKey = (key: string): key is SettingKey => key in SETTING_SCHEMAS;

export function getSettingSchema<K extends SettingKey>(key: K): (typeof SETTING_SCHEMAS)[K] {
  return SETTING_SCHEMAS[key];
}

// Parse and validate a setting value with its schema
export function validateSetting<K extends SettingKey>(key: K, value: unknown): SettingValueOf<K> {
  return getSettingSchema(key).parse(value) as SettingValueOf<K>;
}

// Get the default value for a setting
export function getSettingDefault<K extends SettingKey>(key: K): SettingValueOf<K> {
  return getSettingSchema(key).parse({}) as SettingValueOf<K>;
}

// All settings with their defaults
export const DEFAULT_SETTINGS: Record<SettingKey, unknown> = {
  "features": getSettingDefault("features"),
  "maintenance": getSettingDefault("maintenance"),
  "security.ipAllowlist": getSettingDefault("security.ipAllowlist"),
  "chatbot.config": getSettingDefault("chatbot.config"),
  "email.routing": getSettingDefault("email.routing"),
  "ai.context": getSettingDefault("ai.context"),
  "rbac.seedVersion": getSettingDefault("rbac.seedVersion"),
  "seo.llmsTxt": getSettingDefault("seo.llmsTxt"),
};

// Public settings: subset safe to expose to client-side or caching layers
export const publicSettingKeys = new Set<SettingKey>([
  "features",
  "chatbot.config",
  "maintenance", // Only the enabled flag for the client to know maintenance is on
]);

export function isPublicSetting(key: SettingKey): boolean {
  return publicSettingKeys.has(key);
}
