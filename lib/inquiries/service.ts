import "server-only";

import { repos } from "@/lib/data";
import type { InquiryRow } from "@/lib/data/inquiries";

export interface CreateInquiryInput {
  name: string;
  email: string;
  phone?: string;
  topic?: string;
  message: string;
  source: "contact-form" | "chatbot";
  ipHash?: string;
  userAgent?: string;
  pagePath?: string;
  spamScore: number;
}

export async function createInquiry(input: CreateInquiryInput): Promise<InquiryRow> {
  return repos.inquiries.create({
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    topic: input.topic || null,
    message: input.message,
    source: input.source,
    ipHash: input.ipHash || null,
    userAgent: input.userAgent || null,
    pagePath: input.pagePath || null,
    spamScore: input.spamScore,
    status: input.spamScore > 50 ? "SPAM" : "NEW",
    emailStatus: "PENDING",
    autoReplyStatus: "PENDING",
  });
}

// Check for duplicates: same message + email within 10 minutes
export async function findRecentDuplicate(
  email: string,
  message: string,
  ipHash: string | undefined
): Promise<InquiryRow | null> {
  if (!ipHash) return null;

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  return repos.inquiries.findRecentDuplicate({ email, message, ipHash, since: tenMinutesAgo });
}

export async function getInquiry(id: string) {
  return repos.inquiries.findDetail(id);
}

export async function listInquiries(
  filters?: {
    status?: "NEW" | "CONTACTED" | "CLOSED" | "SPAM";
    search?: string;
    limit?: number;
    offset?: number;
  }
) {
  return repos.inquiries.list({
    status: filters?.status,
    search: filters?.search,
    limit: filters?.limit ?? 50,
    offset: filters?.offset ?? 0,
  });
}
