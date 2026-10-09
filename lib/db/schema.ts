import { createAuthSchema } from "@sahan-sac/auth-kit/drizzle";
import { sql } from "drizzle-orm";
import { boolean, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// The Drizzle schema. Table, column, enum, index and constraint names match
// prisma/schema.prisma exactly, so one database works with either ORM;
// lib/data/schema-parity.test.ts builds both in PGlite and compares them.
// Auth tables (users, sessions, tokens, MFA, roles, audit) come from auth-kit.

const now = sql`CURRENT_TIMESTAMP`;
const newId = () => crypto.randomUUID();
const at = (name: string) => timestamp(name, { precision: 3, mode: "date" });
const id = () => text("id").primaryKey().$defaultFn(newId);
const createdAt = () => at("createdAt").notNull().default(now);
/** Prisma's @updatedAt: set by the client on every write, no database default. */
const updatedAt = () =>
  at("updatedAt")
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());
const textList = (name: string) => text(name).array().default(sql`ARRAY[]::TEXT[]`);

// Roles are rows of the roles table, so a role column holds any role name, not only the built-in ones.
export const auth = createAuthSchema<string>({ defaultRole: "EDITOR" });
export const { roles, mfaPurposeEnum, tokenPurposeEnum, users, rolePermissions, userSessions, authTokens, mfaChallenges, auditLogs } = auth;

export const contentStatusEnum = pgEnum("ContentStatus", ["DRAFT", "PUBLISHED", "SUPERSEDED"]);
export const postStatusEnum = pgEnum("PostStatus", ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]);
export const mediaKindEnum = pgEnum("MediaKind", ["IMAGE", "VIDEO", "DOCUMENT"]);
export const mediaProviderEnum = pgEnum("MediaProvider", ["LOCAL", "CLOUDINARY"]);
export const inquiryStatusEnum = pgEnum("InquiryStatus", ["NEW", "CONTACTED", "CLOSED", "SPAM"]);

// Operational switches (maintenance, feature flags, allowlist).
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedById: text("updatedById"),
  updatedAt: at("updatedAt")
    .notNull()
    .default(now)
    .$onUpdate(() => new Date()),
});

// Versioned page sections: at most one DRAFT and one PUBLISHED row per section.
export const contentBlocks = pgTable(
  "content_blocks",
  {
    id: id(),
    pageSlug: text("pageSlug").notNull(),
    sectionSlug: text("sectionSlug").notNull(),
    version: integer("version").notNull(),
    data: jsonb("data").notNull(),
    status: contentStatusEnum("status").notNull().default("DRAFT"),
    note: text("note"),
    createdById: text("createdById"),
    publishedById: text("publishedById"),
    publishedAt: at("publishedAt"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("content_blocks_pageSlug_sectionSlug_version_key").on(t.pageSlug, t.sectionSlug, t.version),
    index("content_blocks_pageSlug_sectionSlug_status_idx").on(t.pageSlug, t.sectionSlug, t.status),
    index("content_blocks_pageSlug_status_idx").on(t.pageSlug, t.status),
  ]
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    provider: mediaProviderEnum("provider").notNull().default("CLOUDINARY"),
    kind: mediaKindEnum("kind").notNull().default("IMAGE"),
    url: text("url").notNull(),
    publicId: text("publicId"),
    format: text("format").notNull(),
    width: integer("width"),
    height: integer("height"),
    sizeBytes: integer("sizeBytes").notNull(),
    title: text("title"),
    alt: text("alt"),
    tags: textList("tags"),
    folder: text("folder").notNull().default("uncategorized"),
    createdById: text("createdById"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("media_assets_provider_publicId_key").on(t.provider, t.publicId),
    index("media_assets_folder_createdAt_idx").on(t.folder, t.createdAt),
    index("media_assets_createdAt_idx").on(t.createdAt),
  ]
);

export const mediaUsages = pgTable(
  "media_usages",
  {
    id: id(),
    mediaId: text("mediaId").notNull(),
    entityType: text("entityType").notNull(),
    entityId: text("entityId").notNull(),
    field: text("field").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ name: "media_usages_mediaId_fkey", columns: [t.mediaId], foreignColumns: [mediaAssets.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("media_usages_mediaId_entityType_entityId_field_key").on(t.mediaId, t.entityType, t.entityId, t.field),
    index("media_usages_entityType_entityId_idx").on(t.entityType, t.entityId),
  ]
);

export const posts = pgTable(
  "posts",
  {
    id: id(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    content: text("content").notNull(),
    contentHtml: text("contentHtml").notNull(),
    contentText: text("contentText").notNull(),
    topic: text("topic").notNull(),
    tags: textList("tags"),
    status: postStatusEnum("status").notNull().default("DRAFT"),
    publishAt: at("publishAt"),
    publishedAt: at("publishedAt"),
    coverMediaId: text("coverMediaId"),
    coverAlt: text("coverAlt"),
    seoTitle: text("seoTitle"),
    seoDescription: text("seoDescription"),
    canonicalUrl: text("canonicalUrl"),
    readMinutes: integer("readMinutes").notNull().default(1),
    generatedByAI: boolean("generatedByAI").notNull().default(false),
    noindex: boolean("noindex").notNull().default(false),
    authorId: text("authorId"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ name: "posts_coverMediaId_fkey", columns: [t.coverMediaId], foreignColumns: [mediaAssets.id] })
      .onDelete("set null")
      .onUpdate("cascade"),
    foreignKey({ name: "posts_authorId_fkey", columns: [t.authorId], foreignColumns: [users.id] })
      .onDelete("set null")
      .onUpdate("cascade"),
    uniqueIndex("posts_slug_key").on(t.slug),
    index("posts_status_publishedAt_idx").on(t.status, t.publishedAt),
    index("posts_status_publishAt_idx").on(t.status, t.publishAt),
    index("posts_authorId_idx").on(t.authorId),
    index("posts_updatedAt_idx").on(t.updatedAt),
    index("posts_topic_idx").on(t.topic),
  ]
);

export const postRevisions = pgTable(
  "post_revisions",
  {
    id: id(),
    postId: text("postId").notNull(),
    title: text("title").notNull(),
    data: jsonb("data").notNull(),
    reason: text("reason").notNull(),
    createdById: text("createdById"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ name: "post_revisions_postId_fkey", columns: [t.postId], foreignColumns: [posts.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "post_revisions_createdById_fkey", columns: [t.createdById], foreignColumns: [users.id] })
      .onDelete("set null")
      .onUpdate("cascade"),
    index("post_revisions_postId_createdAt_idx").on(t.postId, t.createdAt),
    index("post_revisions_createdById_idx").on(t.createdById),
  ]
);

export const inquiries = pgTable(
  "inquiries",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    topic: text("topic"),
    message: text("message").notNull(),
    status: inquiryStatusEnum("status").notNull().default("NEW"),
    notes: text("notes"),
    assigneeId: text("assigneeId"),
    source: text("source").notNull().default("contact-form"),
    ipHash: text("ipHash"),
    userAgent: text("userAgent"),
    pagePath: text("pagePath"),
    spamScore: integer("spamScore").notNull().default(0),
    emailStatus: text("emailStatus").notNull().default("PENDING"),
    autoReplyStatus: text("autoReplyStatus").notNull().default("PENDING"),
    respondedAt: at("respondedAt"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ name: "inquiries_assigneeId_fkey", columns: [t.assigneeId], foreignColumns: [users.id] })
      .onDelete("set null")
      .onUpdate("cascade"),
    index("inquiries_status_createdAt_idx").on(t.status, t.createdAt),
    index("inquiries_createdAt_idx").on(t.createdAt),
    index("inquiries_ipHash_createdAt_idx").on(t.ipHash, t.createdAt),
  ]
);

export const inquiryEmailEvents = pgTable(
  "inquiry_email_events",
  {
    id: id(),
    inquiryId: text("inquiryId").notNull(),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    ok: boolean("ok").notNull(),
    messageId: text("messageId"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ name: "inquiry_email_events_inquiryId_fkey", columns: [t.inquiryId], foreignColumns: [inquiries.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("inquiry_email_events_inquiryId_idx").on(t.inquiryId),
  ]
);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: id(),
    sessionId: text("sessionId").notNull(),
    ipHash: text("ipHash"),
    userAgent: text("userAgent"),
    pagePath: text("pagePath"),
    inquiryId: text("inquiryId"),
    messagesCount: integer("messagesCount").notNull().default(0),
    capturedLead: boolean("capturedLead").notNull().default(false),
    leadName: text("leadName"),
    leadContact: text("leadContact"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ name: "chat_sessions_inquiryId_fkey", columns: [t.inquiryId], foreignColumns: [inquiries.id] })
      .onDelete("set null")
      .onUpdate("cascade"),
    uniqueIndex("chat_sessions_sessionId_key").on(t.sessionId),
    index("chat_sessions_createdAt_idx").on(t.createdAt),
    index("chat_sessions_inquiryId_idx").on(t.inquiryId),
  ]
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: id(),
    sessionId: text("sessionId").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    tokens: integer("tokens"),
    latencyMs: integer("latencyMs"),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ name: "chat_messages_sessionId_fkey", columns: [t.sessionId], foreignColumns: [chatSessions.sessionId] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("chat_messages_sessionId_createdAt_idx").on(t.sessionId, t.createdAt),
  ]
);

export const chatTrainingEntries = pgTable(
  "chat_training_entries",
  {
    id: id(),
    category: text("category").notNull().default("FAQ"),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("isActive").notNull().default(true),
    createdById: text("createdById"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("chat_training_entries_isActive_priority_idx").on(t.isActive, t.priority)]
);
