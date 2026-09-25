import "server-only";

import { db } from "@/lib/db/prisma";
import type { Inquiry } from "@prisma/client";

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

export async function createInquiry(input: CreateInquiryInput): Promise<Inquiry> {
  return db.inquiry.create({
    data: {
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
    },
  });
}

// Check for duplicates: same message + email within 10 minutes
export async function findRecentDuplicate(
  email: string,
  message: string,
  ipHash: string | undefined
): Promise<Inquiry | null> {
  if (!ipHash) return null;

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  return db.inquiry.findFirst({
    where: {
      email,
      message,
      ipHash,
      createdAt: { gte: tenMinutesAgo },
    },
  });
}

export async function getInquiry(id: string) {
  return db.inquiry.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function listInquiries(
  filters?: {
    status?: "NEW" | "CONTACTED" | "CLOSED" | "SPAM";
    search?: string;
    limit?: number;
    offset?: number;
  }
) {
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const where: Record<string, unknown> = {};
  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.search) {
    const s = filters.search;
    where.OR = [
      { name: { contains: s, mode: "insensitive" as const } },
      { email: { contains: s, mode: "insensitive" as const } },
      { message: { contains: s, mode: "insensitive" as const } },
    ];
  }

  const [rows, total] = await Promise.all([
    db.inquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    }),
    db.inquiry.count({ where }),
  ]);

  return { rows, total };
}
