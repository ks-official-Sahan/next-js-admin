import "server-only";

import { db } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email";
import { contactAutoReply, contactNotify } from "@/lib/email/templates";
import { getEnv } from "@/lib/env";
import { absoluteUrl } from "@/lib/site-url";
import { log } from "@/lib/log";
import type { Inquiry } from "@prisma/client";

export async function notifyOwner(inquiry: Inquiry): Promise<void> {
  const env = getEnv();
  const recipients = env.RESEND_RECIPIENT_EMAILS || [];
  if (recipients.length === 0 || !env.SITE_URL) {
    return;
  }

  const template = contactNotify({
    name: inquiry.name,
    email: inquiry.email,
    subject: inquiry.topic || undefined,
    message: inquiry.message,
    receivedAt: inquiry.createdAt.toLocaleString(),
    adminUrl: absoluteUrl(`/admin/leads/${inquiry.id}`),
  });

  const result = await sendEmail({
    to: recipients,
    cc: env.RESEND_CC_EMAILS || [],
    bcc: env.RESEND_BCC_EMAILS || [],
    subject: template.subject,
    html: template.html,
    text: template.text,
    category: "contact",
    replyTo: inquiry.email,
  });

  // Record all attempts and update status
  await recordEmailEvent(inquiry.id, "notify", result);
  await updateInquiryEmailStatus(inquiry.id, "emailStatus", result.ok ? "SENT" : "FAILED");
}

export async function sendAutoReply(inquiry: Inquiry): Promise<void> {
  const template = contactAutoReply({ name: inquiry.name });

  const result = await sendEmail({
    to: inquiry.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
    category: "contact",
  });

  // Record all attempts and update status
  await recordEmailEvent(inquiry.id, "auto-reply", result);
  await updateInquiryEmailStatus(inquiry.id, "autoReplyStatus", result.ok ? "SENT" : "FAILED");
}

async function recordEmailEvent(
  inquiryId: string,
  kind: "notify" | "auto-reply",
  result: { ok: boolean; provider: string | null; messageId?: string; errorClass?: string; attempts: Array<{ provider: string; ok: boolean; errorClass?: string }> }
): Promise<void> {
  try {
    // Record the final result
    const errorText = result.errorClass ? result.errorClass.slice(0, 500) : null;
    await db.inquiryEmailEvent.create({
      data: {
        inquiryId,
        kind,
        provider: result.provider || "none",
        ok: result.ok,
        messageId: result.messageId || null,
        error: result.ok ? null : errorText,
      },
    });
  } catch (error) {
    log.error("Failed to record email event", { inquiryId, kind, error: (error as Error).message });
  }
}

async function updateInquiryEmailStatus(
  inquiryId: string,
  field: "emailStatus" | "autoReplyStatus",
  status: "SENT" | "FAILED"
): Promise<void> {
  try {
    await db.inquiry.update({
      where: { id: inquiryId },
      data: { [field]: status },
    });
  } catch (error) {
    log.error("Failed to update inquiry email status", { inquiryId, field, error: (error as Error).message });
  }
}
