import { SiteMetadata } from "@/config/site";
import { getIndexablePosts } from "@/lib/blog/queries";

// RSS 2.0 feed of the last 20 published posts (design notes,
// Step 12). Same 300s window as /updates, since both read the same cached
// blog:list loader.

export const revalidate = 300;

const MAX_ITEMS = 20;

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET() {
  const posts = (await getIndexablePosts()).slice(0, MAX_ITEMS);
  const siteUrl = SiteMetadata.siteUrl;
  const now = new Date().toUTCString();
  // The newest post, not the render time: an unchanged feed keeps the same date across regenerations.
  const lastBuildDate = posts[0]?.updatedAt ? new Date(posts[0].updatedAt).toUTCString() : now;

  const items = posts
    .map((post) => {
      const url = `${siteUrl}/updates/${post.slug}`;
      const pubDate = post.publishedAt ? new Date(post.publishedAt).toUTCString() : now;
      const categories = [post.topic, ...post.tags]
        .filter((value, index, all) => value && all.indexOf(value) === index)
        .map((value) => `
      <category>${escapeXml(value)}</category>`)
        .join("");
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(post.excerpt)}</description>${categories}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SiteMetadata.ogSiteName || "Updates")}</title>
    <link>${escapeXml(siteUrl)}</link>
    <atom:link href="${escapeXml(siteUrl)}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Updates from ${escapeXml(SiteMetadata.ogSiteName || "the site")}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
