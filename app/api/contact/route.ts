import { createHmac } from "crypto";
import { after } from "next/server";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { limit } from "@/lib/cache/ratelimit";
import { getEnv } from "@/lib/env";
import { inquiryFormSchema, stripNewlines } from "@/lib/inquiries/schema";
import { findRecentDuplicate, createInquiry } from "@/lib/inquiries/service";
import { scoreSpam } from "@/lib/inquiries/spam";
import { notifyOwner, sendAutoReply } from "@/lib/inquiries/notify";
import { verifyToken } from "@/lib/inquiries/token";
import { clientIp, UNKNOWN_IP } from "@/lib/security/ip";
import { isAllowedOrigin } from "@/lib/security/origin";
import { log } from "@/lib/log";

function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export async function POST(request: NextRequest) {
  const env = getEnv();
  const h = await headers();

  // Content-Type check
  const contentType = h.get("content-type");
  if (!contentType?.includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  // Body size limit (~16 KB)
  const bodyText = await request.text();
  if (bodyText.length > 16 * 1024) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  // Origin check
  const origin = h.get("origin");
  if (!isAllowedOrigin(origin, { hosts: [h.get("host")], siteUrl: env.SITE_URL })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Hash a known IP only (and only when a secret keys the hash).
  const ip = clientIp(h);
  const knownIp = ip === UNKNOWN_IP ? null : ip;
  const ipHash = knownIp && env.INTERNAL_SIGNING_SECRET ? hashIp(knownIp, env.INTERNAL_SIGNING_SECRET) : undefined;

  // Per-IP limit (open fail mode). Skipped when the IP is unknown (R22: no
  // TRUSTED_PROXY_HOPS, or off Vercel): every caller would then share one
  // bucket and a single spammer could block the form for everyone. The
  // global limit below still caps the total.
  if (ipHash) {
    const ipLimit = await limit("contact:ip", ipHash);
    if (!ipLimit.ok && !ipLimit.degraded) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(ipLimit.resetSeconds) } });
    }
  }

  // Global rate limit (open fail mode)
  const globalLimit = await limit("contact:global", "global");
  if (!globalLimit.ok && !globalLimit.degraded) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(globalLimit.resetSeconds) } });
  }

  // Parse form data
  let formData: unknown;
  try {
    formData = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate schema
  const parsed = inquiryFormSchema.safeParse(formData);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const data = parsed.data;

  // Verify timing token (fail closed if secret missing)
  if (!env.INTERNAL_SIGNING_SECRET || !verifyToken(data.token, env.INTERNAL_SIGNING_SECRET)) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  // Honeypot check (silent success)
  if (data.website) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Check for recent duplicates (silent success)
  const duplicate = await findRecentDuplicate(data.email, data.message, ipHash);
  if (duplicate) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Score for spam
  const spamScore = scoreSpam({
    email: data.email,
    message: data.message,
    topic: data.topic,
  });

  // Create inquiry (status SPAM or NEW based on score)
  try {
    const inquiry = await createInquiry({
      name: stripNewlines(data.name),
      email: stripNewlines(data.email),
      phone: data.phone,
      topic: stripNewlines(data.topic),
      message: data.message,
      source: "contact-form",
      ipHash,
      userAgent: h.get("user-agent") || undefined,
      pagePath: new URL(request.url).pathname || undefined,
      spamScore,
    });

    // Schedule emails after response (use `after()` for serverless)
    if (inquiry.status !== "SPAM") {
      // Owner notification
      after(async () => {
        try {
          await notifyOwner(inquiry);
        } catch (error) {
          log.error("notifyOwner failed", { inquiryId: inquiry.id, error: (error as Error).message });
        }
      });

      // Auto-reply (not for spam)
      after(async () => {
        try {
          await sendAutoReply(inquiry);
        } catch (error) {
          log.error("sendAutoReply failed", { inquiryId: inquiry.id, error: (error as Error).message });
        }
      });
    }

    // Same success response for spam (never reveal)
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    log.error("createInquiry failed", { error: (error as Error).message });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
