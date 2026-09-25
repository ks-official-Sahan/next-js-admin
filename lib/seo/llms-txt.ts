import "server-only";

import { getSetting, updateSetting } from "@/lib/settings/service";
import { getIndexablePosts } from "@/lib/blog/queries";
import { getPageContent } from "@/lib/cms/loaders";
import { Site, SiteMetadata } from "@/config/site";
import type { AuthUser } from "@/lib/auth/dal";

import { absoluteSiteUrl } from "./indexnow";

// llms.txt: a short, curated index in the llmstxt.org shape (H1, one-line
// blockquote, `- [title](url): note` sections) that gives AI crawlers and
// assistant agents a structured summary of the site — same purpose as a
// sitemap, but written for language models instead of URL crawlers.
//
// Persisted in the `seo.llmsTxt` setting (not the filesystem — Vercel's
// runtime filesystem is read-only outside /tmp, so writing to
// public/llms.txt from a Server Action would throw on every deploy).
// /llms.txt falls back to generating on the fly when nobody has regenerated
// it yet, so it is never a 404 and never permanently stale by omission.

function link(path: string, title: string, note?: string): string {
  return `- [${title}](${absoluteSiteUrl(path)})${note ? `: ${note}` : ""}`;
}

/** Same list format as link(), for an already-absolute (external) URL. */
function externalLink(url: string, title: string, note?: string): string {
  return `- [${title}](${url})${note ? `: ${note}` : ""}`;
}

/** Builds fresh llms.txt content from the same data sources the site itself renders. */
export async function generateLlmsTxt(): Promise<string> {
  const [posts, home] = await Promise.all([
    getIndexablePosts(),
    getPageContent("home"),
  ]);

  const lines: string[] = [
    `# ${SiteMetadata.title}`,
    "",
    `> ${SiteMetadata.description} Based in ${Site.location}.`,
    "",
    "## Core pages",
    link("", "Home", home.hero.subtitle),
    link("/updates", "Updates", "blog posts and progress notes"),
    link("/contact", "Contact", "get in touch"),
    "",
    "## About",
    `${SiteMetadata.author} — ${Site.myRole} at ${Site.org}, based in ${Site.location}.`,
    externalLink(`mailto:${Site.email}`, "Email", Site.email),
    externalLink(Site.gitHubUrl, "GitHub", Site.gitHubUser),
    externalLink(Site.orgUrl, Site.org, "organization"),
    "",
  ];

  if (posts.length > 0) {
    lines.push("## Recent updates");
    for (const post of posts.slice(0, 10)) {
      lines.push(link(`/updates/${post.slug}`, post.title, post.excerpt));
    }
    lines.push("");
  }

  lines.push(
    "## Contact",
    `${Site.email}${Site.phoneDisplay ? ` · ${Site.phoneDisplay}` : ""}`,
    ""
  );

  return lines.join("\n");
}

/** Serves the persisted content, generating on the fly if never regenerated. */
export async function getLlmsTxtContent(): Promise<string> {
  const stored = await getSetting("seo.llmsTxt");
  if (stored.content) return stored.content;
  return generateLlmsTxt();
}

/** Regenerates and persists llms.txt. Caller must already hold `manageSettings`. */
export async function regenerateLlmsTxt(actor: Pick<AuthUser, "id" | "email">): Promise<string> {
  const content = await generateLlmsTxt();
  await updateSetting("seo.llmsTxt", { content, generatedAt: new Date().toISOString() }, actor);
  return content;
}
