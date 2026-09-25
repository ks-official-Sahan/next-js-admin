import "server-only";

import { cached } from "@/lib/cache/cached";
import { loadOrNull } from "@/lib/cache/fallback";
import { TAGS } from "@/lib/cache/tags";
import { db } from "@/lib/db/prisma";
import { log } from "@/lib/log";
import { getPosts } from "@/lib/blog/queries";
import { getPageContent } from "@/lib/cms/loaders";
import { Site, SiteMetadata } from "@/config/site";

// Builds the knowledge base for the chatbot from published CMS content and
// active training entries. Cached under the `chatbot:knowledge` tag and
// invalidated whenever content or training entries change.

async function buildKnowledge(): Promise<string> {
  const parts: string[] = [];

  // Site profile - ensures the chatbot always knows the basics about this site
  parts.push("### Site Profile\n");
  parts.push(`- **Name:** ${Site.authorFullName} (${Site.author})\n`);
  parts.push(`- **Role:** ${Site.myRole}\n`);
  parts.push(`- **Organization:** ${Site.companyRole}\n`);
  parts.push(`- **Location:** ${Site.location}\n`);
  parts.push(`- **Tagline:** ${Site.tagline}\n`);
  parts.push(`- **Email:** ${Site.email}\n`);
  parts.push(`- **WhatsApp:** ${Site.phoneDisplay}\n`);
  parts.push(`- **GitHub:** ${Site.gitHubUrl}\n`);
  parts.push(`- **Overview:** ${SiteMetadata.description}\n\n`);

  try {
    const [home, contact, posts] = await Promise.all([
      getPageContent("home"),
      getPageContent("contact"),
      getPosts(),
    ]);

    parts.push("### Site Overview\n");

    // Home hero content (typed fields)
    if (home.hero?.title) {
      parts.push(`**Site:** ${home.hero.title}\n`);
      if (home.hero.subtitle) parts.push(`${home.hero.subtitle}\n`);
    }

    // Posts: the question visitors actually ask ("what's new?"). Each new
    // post already drops this cache through the chatbot:knowledge tag.
    if (posts.length > 0) {
      parts.push("\n### Recent writing (on /updates)\n");
      for (const post of posts.slice(0, 10)) parts.push(`- ${post.title} (/updates/${post.slug})\n`);
    }

    // Contact information
    if (contact.socials?.items && Array.isArray(contact.socials.items)) {
      parts.push("\n### Contact Channels\n");
      for (const social of contact.socials.items.slice(0, 5)) {
        if (social.label) {
          parts.push(`- **${social.label}**\n`);
        }
      }
    }
  } catch (error) {
    log.error("Error building knowledge from CMS content", { error: String(error) });
  }

  // Get active training entries
  try {
    const entries = await db.chatTrainingEntry.findMany({
      where: { isActive: true },
      orderBy: { priority: "desc" },
      take: 50,
    });

    if (entries.length > 0) {
      parts.push("\n### Training Data\n");
      for (const entry of entries) {
        parts.push(`**Q:** ${entry.question}\n**A:** ${entry.answer}\n\n`);
      }
    }
  } catch (error) {
    log.error("Error building knowledge from training entries", { error: String(error) });
  }

  return parts.join("");
}

// Load knowledge from cache or null if database is not configured
export async function getKnowledge(): Promise<string | null> {
  return loadOrNull(
    // Bump the version when the knowledge format changes, so stale entries are not served.
    cached(buildKnowledge, ["chatbot", "knowledge", "v3"], {
      tags: [TAGS.chatbotKnowledge],
      revalidate: 3600,
    }),
    {
      onError: (error) =>
        log.warn("chatbot knowledge read failed during build", { error: String(error) }),
    }
  );
}
