import { SiteMetadata } from "@/config/site";
import { getAllIndexablePosts } from "@/lib/blog/queries";
import { getPageLastModified } from "@/lib/cms/loaders";
import type { CmsPage } from "@/lib/cms/registry";
import type { MetadataRoute } from "next";

// Prerendered, not built per request: lastModified comes from cached CMS
// reads (getPageLastModified) and getAllIndexablePosts(), never `new Date()`,
// so the sitemap refreshes with their 300 s cacheLife. A publish shows up
// sooner: lib/cache/plan.ts's forPost()/forPostList()/forCollection()
// revalidatePath("/sitemap.xml") on the relevant actions.

const STATIC_ROUTES: Array<{ path: string; page: CmsPage | null }> = [
  { path: "", page: "home" },
  // /updates has no single CMS page block driving it the way the others do —
  // its lastModified comes from the newest post's publishedAt instead, below.
  { path: "/updates", page: null },
  { path: "/contact", page: "contact" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, lastModifiedByRoute] = await Promise.all([
    getAllIndexablePosts(),
    Promise.all(STATIC_ROUTES.map((route) => (route.page ? getPageLastModified(route.page) : Promise.resolve(null)))),
  ]);

  const newestPostAt = posts[0]?.publishedAt ? new Date(posts[0].publishedAt).toISOString() : null;

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route, index) => {
    // No stored CMS block yet (still on code defaults) or no posts published
    // yet: omit lastModified rather than fabricate one with `new Date()`.
    const lastModified = route.path === "/updates" ? newestPostAt : lastModifiedByRoute[index];
    return {
      url: `${SiteMetadata.siteUrl}${route.path}`,
      ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
      changeFrequency: route.path === "" ? "weekly" : "monthly",
      priority: route.path === "" ? 1 : 0.7,
    };
  });

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => {
    // Last edit first (a corrected post should be recrawled), then publish date; never a fabricated "now".
    const lastModified = post.updatedAt ?? post.publishedAt;
    return {
      url: `${SiteMetadata.siteUrl}/updates/${post.slug}`,
      ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
      changeFrequency: "monthly",
      priority: 0.6,
    };
  });

  return [...staticEntries, ...postEntries];
}
