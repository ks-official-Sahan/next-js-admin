import { createHash, createHmac } from "node:crypto";
import { headers } from "next/headers";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createAiService, realProviders, sharedAiHealth } from "@/lib/ai/providers";
import { limit } from "@/lib/cache/ratelimit";
import { filterModelOutput, guardUserMessage } from "@/lib/chatbot/guard";
import { getKnowledge } from "@/lib/chatbot/knowledge";
import { buildChatPrompt } from "@/lib/chatbot/prompts";
import { addMessage, getSessionMessages, upsertSession } from "@/lib/chatbot/session";
import {
  CHAT_VISITOR_COOKIE,
  chatVisitorCookieOptions,
  newChatVisitorId,
  signChatVisitorId,
  verifyChatVisitorCookie,
} from "@/lib/chatbot/visitor-cookie";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { clientIp, UNKNOWN_IP } from "@/lib/security/ip";
import { isAllowedOrigin } from "@/lib/security/origin";
import type { ChatbotConfig } from "@/lib/settings/schema";
import { getPublicSettings } from "@/lib/settings/service";
import { Site } from "@/config/site";

function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

// sessionId is a client-generated opaque id (see lib/chatbot/session.ts) —
// not a secret, just a grouping key — hence the character class rather than
// a specific format. message is what the visitor typed.
const chatRequestSchema = z.object({
  sessionId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,128}$/, "sessionId must be 8-128 characters of letters, digits, - or _"),
  message: z.string().trim().min(1, "message is required").max(1000, "message is too long"),
});

export async function POST(request: NextRequest) {
  const env = getEnv();
  const h = await headers();

  // A visitor cookie may need to be (re)issued below when the caller's IP is
  // unknown; every response this handler returns goes through jsonResponse()
  // so that cookie always makes it onto the response, not just the success path.
  let freshVisitorCookie: string | undefined;
  function jsonResponse(body: unknown, init: ResponseInit = {}): NextResponse {
    const response = NextResponse.json(body, init);
    response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    if (freshVisitorCookie) {
      response.cookies.set(
        CHAT_VISITOR_COOKIE,
        freshVisitorCookie,
        chatVisitorCookieOptions(process.env.NODE_ENV === "production")
      );
    }
    return response;
  }

  // Content-Type check
  const contentType = h.get("content-type");
  if (!contentType?.includes("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  // Body size limit (~8 KB)
  const bodyText = await request.text();
  if (bodyText.length > 8 * 1024) {
    return jsonResponse({ error: "Request body too large" }, { status: 413 });
  }

  // Origin check
  const origin = h.get("origin");
  if (!isAllowedOrigin(origin, { hosts: [h.get("host")], siteUrl: env.SITE_URL })) {
    return jsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIp(h);
  const knownIp = ip === UNKNOWN_IP ? null : ip;
  // Stored with the chat session only when a secret keys the hash.
  const ipHash = knownIp && env.INTERNAL_SIGNING_SECRET ? hashIp(knownIp, env.INTERNAL_SIGNING_SECRET) : undefined;

  // Per-IP limit (20 per 10 minutes) when the IP is known. When it is not
  // (R22: no TRUSTED_PROXY_HOPS, or off Vercel — every caller then shares
  // UNKNOWN_IP), a bare per-session limit alone would let one visitor open
  // unlimited sessions for free by rotating sessionId, so a signed,
  // HttpOnly cookie carrying a random visitor id stands in for the IP: a
  // valid cookie is rate-limited on the same chat:ip bucket, keyed by the
  // visitor id instead of the IP hash. A missing or invalid cookie gets a
  // fresh id and a stricter budget — there is no dedicated "chat:anon"
  // bucket (adding one needs an edit to
  // packages/auth-kit/src/cache/ratelimit.ts, off limits here), so this
  // reuses chat:session's tighter per-minute limit, keyed by the new
  // visitor id, for that first cookie-less request only.
  if (knownIp) {
    const ipLimit = await limit("chat:ip", createHash("sha256").update(knownIp).digest("hex").slice(0, 32));
    if (!ipLimit.ok) {
      return jsonResponse(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(ipLimit.resetSeconds) } }
      );
    }
  } else if (env.INTERNAL_SIGNING_SECRET) {
    const cookieValue = request.cookies.get(CHAT_VISITOR_COOKIE)?.value;
    const visitorId = verifyChatVisitorCookie(cookieValue, env.INTERNAL_SIGNING_SECRET);
    if (visitorId) {
      const visitorLimit = await limit("chat:ip", visitorId);
      if (!visitorLimit.ok) {
        return jsonResponse(
          { error: "Too many requests" },
          { status: 429, headers: { "Retry-After": String(visitorLimit.resetSeconds) } }
        );
      }
    } else {
      const newId = newChatVisitorId();
      freshVisitorCookie = signChatVisitorId(newId, env.INTERNAL_SIGNING_SECRET);
      const freshLimit = await limit("chat:session", newId);
      if (!freshLimit.ok) {
        return jsonResponse(
          { error: "Too many requests" },
          { status: 429, headers: { "Retry-After": String(freshLimit.resetSeconds) } }
        );
      }
    }
  }

  // Parse request
  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsedBody = chatRequestSchema.safeParse(data);
  if (!parsedBody.success) {
    return jsonResponse({ error: "Invalid request" }, { status: 400 });
  }
  const chatReq = parsedBody.data;

  // Rate limit by session (per minute, 6 messages)
  const sessionLimit = await limit("chat:session", chatReq.sessionId);
  if (!sessionLimit.ok) {
    return jsonResponse(
      { error: "Too many messages in this session" },
      { status: 429, headers: { "Retry-After": String(sessionLimit.resetSeconds) } }
    );
  }

  const t0 = Date.now();
  try {
    // Check if chatbot is enabled with safe fallbacks
    let chatbotEnabled = true;
    let chatbotConfig: ChatbotConfig = {
      enabled: true,
      tone: "professional",
      greeting: "Hi! How can I help?",
      trainingDataVersion: 0,
    };

    try {
      const settings = await getPublicSettings();
      const features = settings?.features as { chatbotEnabled?: boolean } | undefined;
      if (features && typeof features.chatbotEnabled === "boolean") {
        chatbotEnabled = features.chatbotEnabled;
      }
      if (settings?.["chatbot.config"]) {
        chatbotConfig = { ...chatbotConfig, ...(settings["chatbot.config"] as Partial<ChatbotConfig>) };
      }
    } catch (err) {
      log.warn("Failed to load settings in chat route, proceeding with defaults", { error: String(err) });
    }

    if (!chatbotEnabled) {
      return jsonResponse({ error: "Chatbot is not available" }, { status: 503 });
    }
    if (!chatbotConfig.enabled) {
      return jsonResponse({ error: "Chatbot is disabled" }, { status: 503 });
    }

    // Reads run together; history is taken before this turn is stored.
    let history: { role: string; content: string }[] = [];
    let knowledge: string | null = null;
    try {
      const [hist, kn] = await Promise.all([
        getSessionMessages(chatReq.sessionId, 10).catch(() => []),
        getKnowledge().catch(() => null),
        upsertSession({ sessionId: chatReq.sessionId, ipHash, userAgent: h.get("user-agent") || undefined }).catch((err) => {
          log.warn("Failed to upsert chat session", { error: String(err) });
          return null;
        }),
      ]);
      history = hist;
      knowledge = kn;
    } catch (err) {
      log.warn("Failed gathering session/knowledge context for chat", { error: String(err) });
    }

    const storedUserMessage = addMessage({ sessionId: chatReq.sessionId, role: "user", content: chatReq.message }).catch((error) =>
      log.warn("Failed to store chat message", { error: String(error) })
    );

    const prompt = buildChatPrompt({
      config: chatbotConfig,
      knowledge: knowledge || "",
      userMessage: guardUserMessage(chatReq.message),
      history,
    });

    // A visitor waits on this: fail over fast and give up well before a proxy timeout.
    const aiService = createAiService({
      providers: realProviders(env, "chat"),
      timeoutMs: 12_000,
      deadlineMs: 20_000,
      hedgeAfterMs: 5_000,
      health: sharedAiHealth,
    });

    const started = Date.now();
    const result = await aiService.generate(prompt, { maxTokens: 500 });
    const latencyMs = Date.now() - started;

    if (!result.ok) {
      log.warn("AI service failed for chat", { error: result.errorClass });
      return jsonResponse({ error: "Failed to generate response" }, { status: 503 });
    }

    // Filter output (pure function with explicit allowed hosts)
    const responseText = result.text || "I apologize, but I was unable to generate a response.";
    const siteHostname = env.SITE_URL ? new URL(env.SITE_URL).hostname : "example.com";
    // Links may point only where the owner's own content already points
    // (project and profile URLs in the knowledge), never to a host the model invented.
    const knowledgeHosts = [...(knowledge ?? "").matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((match) => match[1].toLowerCase());
    const filteredResponse = filterModelOutput(responseText, {
      siteHostname,
      allowedHosts: [...new Set([siteHostname, "wa.me", "t.me", ...knowledgeHosts])],
      siteEmail: Site.email,
    });

    // The visitor gets the reply now; the transcript is written after the response.
    after(async () => {
      try {
        await storedUserMessage;
        await addMessage({
          sessionId: chatReq.sessionId,
          role: "assistant",
          content: filteredResponse,
          tokens: Math.ceil((result.text || "").length / 4), // Rough estimate
          latencyMs,
        });
      } catch (error) {
        log.warn("Failed to store chat transcript", { error: String(error) });
      }
    });

    // Phase timings for monitoring (no content, no identifiers).
    const serverTiming = `prep;dur=${started - t0}, ai;dur=${latencyMs};desc="${result.provider}", total;dur=${Date.now() - t0}`;
    return jsonResponse(
      { response: filteredResponse, sessionId: chatReq.sessionId },
      { headers: { "Server-Timing": serverTiming, "Cache-Control": "no-store" } }
    );
  } catch (error) {
    log.error("Chat API error", { error: String(error) });
    return jsonResponse({ error: "Internal server error" }, { status: 500 });
  }
}
