import { SiteMetadata } from "@/config/site";
import type { MetadataRoute } from "next";

// AI crawlers/assistants that fetch pages to answer questions or train on the
// open web. The owner wants the public site citable by AI search engines, so
// each is explicitly allowed the same public paths as everyone else. Only
// /api/ is closed. /admin is deliberately not listed: the admin is a hidden
// sign-in that answers 404 until unlocked (proxy.ts), every admin page is
// noindex, and naming it here would only advertise it.
const AI_CRAWLERS = [
  "GPTBot", // OpenAI: crawls for ChatGPT/model training
  "OAI-SearchBot", // OpenAI: ChatGPT web search citations
  "ChatGPT-User", // OpenAI: live browsing invoked from a ChatGPT chat
  "ClaudeBot", // Anthropic: crawls for Claude
  "Claude-SearchBot", // Anthropic: Claude web search citations
  "PerplexityBot", // Perplexity: search index and citations
  "Google-Extended", // Google: Gemini/AI Overviews training and grounding
  "Applebot-Extended", // Apple: Apple Intelligence training
  "CCBot", // Common Crawl: dataset used by many AI labs
  "Bytespider", // ByteDance: crawls for its AI products
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: "/api/",
      })),
    ],
    sitemap: `${SiteMetadata.siteUrl}/sitemap.xml`,
  };
}
