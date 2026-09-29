import "server-only";

import { buildKnowledge, profileSection, trainingSection, type KnowledgeSource } from "@sahan-sac/chat-kit/knowledge";

import { cached } from "@/lib/cache/cached";
import { loadOrNull } from "@/lib/cache/fallback";
import { TAGS } from "@/lib/cache/tags";
import { db } from "@/lib/db/prisma";
import { log } from "@/lib/log";
import { getPosts } from "@/lib/blog/queries";
import { getPageContent } from "@/lib/cms/loaders";

import { chatSite } from "./site";

// The chatbot's knowledge base: the owner profile, published CMS content and
// posts, and active training entries. @sahan-sac/chat-kit runs the sources
// together (one failing source never empties the rest); this module owns what
// they read and the cache, under the `chatbot:knowledge` tag, invalidated
// whenever content, posts or training entries change.

async function siteContent(): Promise<string> {
  const parts: string[] = [];
  const [home, contact, posts] = await Promise.all([getPageContent("home"), getPageContent("contact"), getPosts()]);

  parts.push("### Site Overview\n");
  if (home.hero?.title) {
    parts.push(`**Site:** ${home.hero.title}\n`);
    if (home.hero.subtitle) parts.push(`${home.hero.subtitle}\n`);
  }

  // Posts: the question visitors actually ask ("what's new?").
  if (posts.length > 0) {
    parts.push("\n### Recent writing (on /updates)\n");
    for (const post of posts.slice(0, 10)) parts.push(`- ${post.title} (/updates/${post.slug})\n`);
  }

  if (contact.socials?.items && Array.isArray(contact.socials.items)) {
    parts.push("\n### Contact Channels\n");
    for (const social of contact.socials.items.slice(0, 5)) {
      if (social.label) parts.push(`- **${social.label}**\n`);
    }
  }
  return parts.join("");
}

async function trainingEntries(): Promise<string> {
  const entries = await db.chatTrainingEntry.findMany({
    where: { isActive: true },
    orderBy: { priority: "desc" },
    take: 50,
    select: { question: true, answer: true },
  });
  return trainingSection(entries);
}

const SOURCES: readonly KnowledgeSource[] = [
  { name: "profile", load: () => profileSection(chatSite) },
  { name: "site content", load: siteContent },
  { name: "training entries", load: trainingEntries },
];

function loadKnowledge(): Promise<string> {
  return buildKnowledge(SOURCES, {
    onError: (source, error) => log.error("chatbot knowledge source failed", { source, error: String(error) }),
  });
}

// Load knowledge from cache or null if database is not configured
export async function getKnowledge(): Promise<string | null> {
  return loadOrNull(
    // Bump the version when the knowledge format changes, so stale entries are not served.
    cached(loadKnowledge, ["chatbot", "knowledge", "v4"], {
      tags: [TAGS.chatbotKnowledge],
      revalidate: 3600,
    }),
    {
      onError: (error) => log.warn("chatbot knowledge read failed during build", { error: String(error) }),
    }
  );
}
