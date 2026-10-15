import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import FinalCta from "@/components/home/FinalCta";
import PostArticle from "@/components/updates/PostArticle";
import { SiteMetadata } from "@/config/site";
import { getPageContent } from "@/lib/cms/loaders";
import { getRecentPosts, getPostBySlug, getPostRedirect, relatedPosts, type BlogPostView } from "@/lib/blog/queries";
import { RSS_ALTERNATES } from "@/lib/metadata";
import { jsonLdHtml } from "@/lib/seo/json-ld";

// One full post per published slug (design notes, Step 12).
// 300s revalidate matches /updates, so a newly published or scheduled post's
// page appears within the same window.
export const revalidate = 300;
export const dynamicParams = true;
// No loading.tsx may sit above this route (the home and /updates skeletons
// live in the (home) and updates/(list) route groups for that reason): a
// Suspense boundary starts streaming a 200 before notFound() below can run,
// so an unknown slug would answer a soft 404 instead of a real one.

export async function generateStaticParams() {
  // Older posts remain available through dynamicParams, while only the newest
  // 50 are eagerly generated during builds.
  const posts = await getRecentPosts(50);
  return posts.map((post) => ({ slug: post.slug }));
}

function postUrl(post: BlogPostView): string {
  return `${SiteMetadata.siteUrl}/updates/${post.slug}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};

  const url = post.canonicalUrl || postUrl(post);
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || post.contentText.slice(0, 160);
  const author = post.authorName || SiteMetadata.author;

  return {
    title,
    description,
    authors: [{ name: author, url: SiteMetadata.siteUrl }],
    keywords: post.tags,
    alternates: { canonical: url, types: RSS_ALTERNATES },
    // Readable by visitors, kept out of search results; links still followed.
    ...(post.noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "article",
      siteName: SiteMetadata.ogSiteName,
      url,
      title,
      description,
      authors: [author],
      section: post.topic,
      tags: post.tags,
      ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
      ...(post.updatedAt ? { modifiedTime: post.updatedAt } : {}),
      ...(post.coverUrl
        ? {
            images: [
              {
                url: post.coverUrl,
                alt: post.coverAlt || title,
                ...(post.coverWidth && post.coverHeight ? { width: post.coverWidth, height: post.coverHeight } : {}),
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      creator: SiteMetadata.twitterUsername,
      title,
      description,
    },
  };
}

/** BlogPosting plus its breadcrumb trail, the two entities answer engines read for an article. */
function postJsonLd(post: BlogPostView) {
  const url = postUrl(post);
  const author = post.authorName || SiteMetadata.author;
  return [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      headline: post.title,
      description: post.seoDescription || post.excerpt,
      url,
      ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
      ...(post.updatedAt || post.publishedAt ? { dateModified: post.updatedAt || post.publishedAt } : {}),
      author: { "@type": "Person", name: author, url: SiteMetadata.siteUrl },
      publisher: { "@type": "Person", name: SiteMetadata.author, url: SiteMetadata.siteUrl },
      ...(post.coverUrl ? { image: post.coverUrl } : {}),
      articleSection: post.topic,
      keywords: post.tags.join(", "),
      wordCount: post.contentText.split(/\s+/).filter(Boolean).length,
      timeRequired: `PT${post.readMinutes}M`,
      inLanguage: "en",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SiteMetadata.siteUrl },
        { "@type": "ListItem", position: 2, name: "Updates", item: `${SiteMetadata.siteUrl}/updates` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];
}

export default async function UpdatePostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [post, posts, home] = await Promise.all([getPostBySlug(slug), getRecentPosts(50), getPageContent("home")]);
  if (!post) {
    // A renamed post's old slug answers with a 308 to its current one.
    const target = await getPostRedirect(slug);
    if (target) permanentRedirect(`/updates/${target}`);
    notFound();
  }

  // Candidates are the 50 newest public posts (one cached read, also used by
  // generateMetadata), so recommendations lean toward fresh content and an
  // older post is recommended only while it is among them. Deliberate: a
  // tag-matched read across every post would add a query per article.
  const related = relatedPosts(post, posts);

  return (
    <div className="w-full overflow-hidden font-medium">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(postJsonLd(post)) }} />
      <PostArticle post={post} related={related} />

      <FinalCta content={home.finalCta} channels={home.channels} />
    </div>
  );
}
