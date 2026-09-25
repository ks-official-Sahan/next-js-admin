import "server-only";

import { createMfa } from "@sahan-sac/auth-kit/mfa";

import { auditSafe } from "@/lib/admin/audit";
import { limit } from "@/lib/cache/ratelimit";
import { sendEmail } from "@/lib/email";
import { mfaCode } from "@/lib/email/templates";

import { AUTH_SECRET } from "./kit";
import { prismaAuthAdapter } from "./prisma-adapter";

// Emailed one-time codes for sign-in, enabling and disabling MFA.

// auth-kit's deps are typed with the loose shape any app could have, but the
// app's own `limit` and `sendEmail` are typed against its specific bucket
// names and email categories, so they are not structurally assignable as
// bare references.
const limitAdapter = (bucket: string, key: string) => limit(bucket as Parameters<typeof limit>[0], key);
const sendEmailAdapter = (
  message: { to: string; subject: string; html: string; text: string; category: string },
  context: { actor: { id: string; email: string } }
) => sendEmail(message as Parameters<typeof sendEmail>[0], context);

export const { issueChallenge, verifyChallenge, consumeChallenge, challengeOwner } = createMfa({
  adapter: prismaAuthAdapter,
  authSecret: AUTH_SECRET,
  limit: limitAdapter,
  sendEmail: sendEmailAdapter,
  audit: auditSafe,
  renderMfaCode: mfaCode,
});

export type { IssueResult, MfaPurpose, VerifyResult } from "@sahan-sac/auth-kit/mfa";
