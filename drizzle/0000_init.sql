CREATE TYPE "ContentStatus" AS ENUM('DRAFT', 'PUBLISHED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "InquiryStatus" AS ENUM('NEW', 'CONTACTED', 'CLOSED', 'SPAM');--> statement-breakpoint
CREATE TYPE "MediaKind" AS ENUM('IMAGE', 'VIDEO', 'DOCUMENT');--> statement-breakpoint
CREATE TYPE "MediaProvider" AS ENUM('LOCAL', 'CLOUDINARY', 'S3', 'R2');--> statement-breakpoint
CREATE TYPE "MfaPurpose" AS ENUM('SIGN_IN', 'ENABLE', 'DISABLE', 'STEP_UP', 'PASSKEY_REGISTER', 'PASSKEY_SIGN_IN');--> statement-breakpoint
CREATE TYPE "PostStatus" AS ENUM('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "TokenPurpose" AS ENUM('INVITE', 'PASSWORD_RESET', 'EMAIL_CHANGE');--> statement-breakpoint
CREATE TYPE "WebhookDeliveryStatus" AS ENUM('PENDING', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actorId" text,
	"actorEmail" text,
	"actorRole" text,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"userAgent" text,
	"meta" jsonb,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" "TokenPurpose" NOT NULL,
	"email" text NOT NULL,
	"userId" text,
	"role" text,
	"tokenHash" text NOT NULL,
	"createdById" text,
	"expiresAt" timestamp (3) NOT NULL,
	"usedAt" timestamp (3),
	"revokedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"sessionId" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tokens" integer,
	"latencyMs" integer,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"sessionId" text NOT NULL,
	"ipHash" text,
	"userAgent" text,
	"pagePath" text,
	"inquiryId" text,
	"messagesCount" integer DEFAULT 0 NOT NULL,
	"capturedLead" boolean DEFAULT false NOT NULL,
	"leadName" text,
	"leadContact" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);--> statement-breakpoint
CREATE TABLE "chat_training_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text DEFAULT 'FAQ' NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdById" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);--> statement-breakpoint
CREATE TABLE "content_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"pageSlug" text NOT NULL,
	"sectionSlug" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"status" "ContentStatus" DEFAULT 'DRAFT' NOT NULL,
	"note" text,
	"createdById" text,
	"publishedById" text,
	"publishedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"topic" text,
	"message" text NOT NULL,
	"status" "InquiryStatus" DEFAULT 'NEW' NOT NULL,
	"notes" text,
	"assigneeId" text,
	"source" text DEFAULT 'contact-form' NOT NULL,
	"ipHash" text,
	"userAgent" text,
	"pagePath" text,
	"spamScore" integer DEFAULT 0 NOT NULL,
	"emailStatus" text DEFAULT 'PENDING' NOT NULL,
	"autoReplyStatus" text DEFAULT 'PENDING' NOT NULL,
	"respondedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);--> statement-breakpoint
CREATE TABLE "inquiry_email_events" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiryId" text NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"ok" boolean NOT NULL,
	"messageId" text,
	"error" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" "MediaProvider" DEFAULT 'CLOUDINARY' NOT NULL,
	"accountId" text DEFAULT 'cloudinary' NOT NULL,
	"kind" "MediaKind" DEFAULT 'IMAGE' NOT NULL,
	"url" text NOT NULL,
	"publicId" text,
	"format" text NOT NULL,
	"width" integer,
	"height" integer,
	"sizeBytes" integer NOT NULL,
	"title" text,
	"alt" text,
	"tags" text[] DEFAULT ARRAY[]::TEXT[],
	"folder" text DEFAULT 'uncategorized' NOT NULL,
	"createdById" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);--> statement-breakpoint
CREATE TABLE "media_usages" (
	"id" text PRIMARY KEY NOT NULL,
	"mediaId" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"field" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "mfa_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"purpose" "MfaPurpose" NOT NULL,
	"codeHash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"verifiedAt" timestamp (3),
	"consumedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "mfa_recovery_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"codeHash" text NOT NULL,
	"usedAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "post_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"postId" text NOT NULL,
	"title" text NOT NULL,
	"data" jsonb NOT NULL,
	"reason" text NOT NULL,
	"createdById" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "post_slug_redirects" (
	"slug" text PRIMARY KEY NOT NULL,
	"postId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"content" text NOT NULL,
	"contentHtml" text NOT NULL,
	"contentText" text NOT NULL,
	"autoExcerpt" text DEFAULT '' NOT NULL,
	"topic" text NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::TEXT[],
	"status" "PostStatus" DEFAULT 'DRAFT' NOT NULL,
	"publishAt" timestamp (3),
	"publishedAt" timestamp (3),
	"coverMediaId" text,
	"coverAlt" text,
	"seoTitle" text,
	"seoDescription" text,
	"canonicalUrl" text,
	"readMinutes" integer DEFAULT 1 NOT NULL,
	"generatedByAI" boolean DEFAULT false NOT NULL,
	"noindex" boolean DEFAULT false NOT NULL,
	"authorId" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"updatedById" text,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "role_permissions_pkey" PRIMARY KEY("role","permission")
);--> statement-breakpoint
CREATE TABLE "roles" (
	"name" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"rank" integer NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updatedById" text,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "trash_items" (
	"id" text PRIMARY KEY NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"label" text NOT NULL,
	"data" jsonb NOT NULL,
	"deletedById" text,
	"deletedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text,
	"userId" text NOT NULL,
	"ip" text,
	"userAgent" text,
	"browser" text,
	"os" text,
	"device" text,
	"mfaVerified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastSeenAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expiresAt" timestamp (3) NOT NULL,
	"revokedAt" timestamp (3),
	"revokedById" text,
	"revokeReason" text
);--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"name" text,
	"passwordHash" text NOT NULL,
	"role" text DEFAULT 'EDITOR' NOT NULL,
	"image" text,
	"bio" text,
	"mfaEnabled" boolean DEFAULT false NOT NULL,
	"totpSecretCipher" text,
	"totpEnabledAt" timestamp (3),
	"mustChangePassword" boolean DEFAULT false NOT NULL,
	"masked" boolean DEFAULT false NOT NULL,
	"passwordChangedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastLoginAt" timestamp (3),
	"disabledAt" timestamp (3),
	"createdById" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"publicKey" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT ARRAY[]::text[],
	"deviceType" text NOT NULL,
	"backedUp" boolean DEFAULT false NOT NULL,
	"name" text DEFAULT 'Passkey' NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"lastUsedAt" timestamp (3)
);--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"endpointId" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotencyKey" text NOT NULL,
	"status" "WebhookDeliveryStatus" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"nextAttemptAt" timestamp (3),
	"responseStatus" integer,
	"lastError" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"deliveredAt" timestamp (3)
);--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"secretCipher" text NOT NULL,
	"events" text[] DEFAULT ARRAY[]::TEXT[],
	"active" boolean DEFAULT true NOT NULL,
	"createdById" text,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens" USING btree ("tokenHash");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_sessions_sessionId_key" ON "chat_sessions" USING btree ("sessionId");--> statement-breakpoint
CREATE UNIQUE INDEX "content_blocks_pageSlug_sectionSlug_version_key" ON "content_blocks" USING btree ("pageSlug","sectionSlug","version");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_provider_accountId_publicId_key" ON "media_assets" USING btree ("provider","accountId","publicId");--> statement-breakpoint
CREATE UNIQUE INDEX "media_usages_mediaId_entityType_entityId_field_key" ON "media_usages" USING btree ("mediaId","entityType","entityId","field");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_recovery_codes_userId_codeHash_key" ON "mfa_recovery_codes" USING btree ("userId","codeHash");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_key" ON "posts" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "trash_items_entityType_entityId_key" ON "trash_items" USING btree ("entityType","entityId");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_key" ON "user_sessions" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_idempotencyKey_key" ON "webhook_deliveries" USING btree ("idempotencyKey");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_role_fkey" FOREIGN KEY ("role") REFERENCES "roles"("name") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("sessionId") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "inquiry_email_events" ADD CONSTRAINT "inquiry_email_events_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "media_usages" ADD CONSTRAINT "media_usages_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media_assets"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "post_slug_redirects" ADD CONSTRAINT "post_slug_redirects_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media_assets"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_fkey" FOREIGN KEY ("role") REFERENCES "roles"("name") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_fkey" FOREIGN KEY ("role") REFERENCES "roles"("name") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "audit_logs_createdAt_id_idx" ON "audit_logs" USING btree ("createdAt","id");--> statement-breakpoint
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs" USING btree ("actorId");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs" USING btree ("entityType","entityId");--> statement-breakpoint
CREATE INDEX "auth_tokens_email_purpose_idx" ON "auth_tokens" USING btree ("email","purpose");--> statement-breakpoint
CREATE INDEX "auth_tokens_expiresAt_idx" ON "auth_tokens" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "auth_tokens_purpose_expiresAt_idx" ON "auth_tokens" USING btree ("purpose","expiresAt");--> statement-breakpoint
CREATE INDEX "chat_messages_sessionId_createdAt_idx" ON "chat_messages" USING btree ("sessionId","createdAt");--> statement-breakpoint
CREATE INDEX "chat_sessions_createdAt_idx" ON "chat_sessions" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "chat_sessions_inquiryId_idx" ON "chat_sessions" USING btree ("inquiryId");--> statement-breakpoint
CREATE INDEX "chat_training_entries_isActive_priority_idx" ON "chat_training_entries" USING btree ("isActive","priority");--> statement-breakpoint
CREATE INDEX "content_blocks_pageSlug_sectionSlug_status_idx" ON "content_blocks" USING btree ("pageSlug","sectionSlug","status");--> statement-breakpoint
CREATE INDEX "content_blocks_pageSlug_status_idx" ON "content_blocks" USING btree ("pageSlug","status");--> statement-breakpoint
CREATE INDEX "inquiries_status_createdAt_idx" ON "inquiries" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "inquiries_createdAt_idx" ON "inquiries" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "inquiries_ipHash_createdAt_idx" ON "inquiries" USING btree ("ipHash","createdAt");--> statement-breakpoint
CREATE INDEX "inquiry_email_events_inquiryId_idx" ON "inquiry_email_events" USING btree ("inquiryId");--> statement-breakpoint
CREATE INDEX "media_assets_accountId_idx" ON "media_assets" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "media_assets_folder_createdAt_idx" ON "media_assets" USING btree ("folder","createdAt");--> statement-breakpoint
CREATE INDEX "media_assets_createdAt_id_idx" ON "media_assets" USING btree ("createdAt","id");--> statement-breakpoint
CREATE INDEX "media_usages_entityType_entityId_idx" ON "media_usages" USING btree ("entityType","entityId");--> statement-breakpoint
CREATE INDEX "mfa_challenges_userId_purpose_expiresAt_idx" ON "mfa_challenges" USING btree ("userId","purpose","expiresAt");--> statement-breakpoint
CREATE INDEX "mfa_challenges_expiresAt_idx" ON "mfa_challenges" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "post_revisions_postId_createdAt_idx" ON "post_revisions" USING btree ("postId","createdAt");--> statement-breakpoint
CREATE INDEX "post_revisions_createdById_idx" ON "post_revisions" USING btree ("createdById");--> statement-breakpoint
CREATE INDEX "post_slug_redirects_postId_idx" ON "post_slug_redirects" USING btree ("postId");--> statement-breakpoint
CREATE INDEX "posts_status_publishedAt_id_idx" ON "posts" USING btree ("status","publishedAt","id");--> statement-breakpoint
CREATE INDEX "posts_status_publishAt_id_idx" ON "posts" USING btree ("status","publishAt","id");--> statement-breakpoint
CREATE INDEX "posts_status_noindex_publishedAt_id_idx" ON "posts" USING btree ("status","noindex","publishedAt","id");--> statement-breakpoint
CREATE INDEX "posts_status_noindex_publishAt_id_idx" ON "posts" USING btree ("status","noindex","publishAt","id");--> statement-breakpoint
CREATE INDEX "posts_coverMediaId_idx" ON "posts" USING btree ("coverMediaId");--> statement-breakpoint
CREATE INDEX "posts_authorId_idx" ON "posts" USING btree ("authorId");--> statement-breakpoint
CREATE INDEX "posts_updatedAt_idx" ON "posts" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "posts_topic_idx" ON "posts" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "roles_rank_idx" ON "roles" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "trash_items_deletedAt_idx" ON "trash_items" USING btree ("deletedAt");--> statement-breakpoint
CREATE INDEX "user_sessions_userId_revokedAt_idx" ON "user_sessions" USING btree ("userId","revokedAt");--> statement-breakpoint
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "user_sessions_lastSeenAt_idx" ON "user_sessions" USING btree ("lastSeenAt");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "webauthn_credentials_userId_idx" ON "webauthn_credentials" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_nextAttemptAt_idx" ON "webhook_deliveries" USING btree ("status","nextAttemptAt");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpointId_createdAt_idx" ON "webhook_deliveries" USING btree ("endpointId","createdAt");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_createdAt_idx" ON "webhook_deliveries" USING btree ("createdAt");
