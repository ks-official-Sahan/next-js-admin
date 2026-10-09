import "server-only";

import { mergeGuidance } from "@sahan-sac/ai-core/guard";
import type { BlogSiteProfile } from "@sahan-sac/blog-kit/prompts";
import type { ChatSite } from "@sahan-sac/chat-kit/types";

import { blogSite } from "@/lib/ai/blog-site";
import { chatSite } from "@/lib/chatbot/site";
import { log } from "@/lib/log";
import type { AiContextScope } from "@/lib/settings/schema";
import { getSetting } from "@/lib/settings/service";

// The owner's AI context (Settings > AI context) for one feature: the global
// text, then the feature's own. Read through the cached setting, so a request
// costs no database read once warm. A failed read means no guidance, never a
// failed AI request.

export async function aiGuidance(scope: Exclude<AiContextScope, "global">): Promise<string> {
  try {
    const context = await getSetting("ai.context");
    return mergeGuidance(context.global, context[scope]);
  } catch (error) {
    log.warn("ai context unavailable", { scope, error: String(error) });
    return "";
  }
}

/** The blog site profile with the blog (or SEO) guidance attached. */
export async function blogSiteWithGuidance(scope: "blog" | "seo" = "blog"): Promise<BlogSiteProfile> {
  return { ...blogSite, guidance: await aiGuidance(scope) };
}

/** The chatbot's owner identity with the chatbot guidance attached. */
export async function chatSiteWithGuidance(): Promise<ChatSite> {
  return { ...chatSite, guidance: await aiGuidance("chatbot") };
}
