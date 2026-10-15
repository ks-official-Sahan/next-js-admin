import Link from "next/link";
import type { ReactNode } from "react";

import { cloudinaryImageUrl, cloudinarySrcSet } from "@sahan-sac/media-kit/delivery";

import { HomeContainer } from "@/components/home/HomeSection";
import { SiteMetadata } from "@/config/site";
import type { BlogPostSummary, BlogPostView } from "@/lib/blog/queries";
import { extractToc, renderPostContent } from "@/lib/blog/render";

// One post as an article: the public /updates/[slug] page and the signed
// preview (/preview/post/[id]) render the same markup, so a preview cannot
// drift from what readers will see.

/** An edit counts as an update worth showing only when it lands a day or more after publishing. */
const UPDATE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Cover widths for srcset: phone, phone at 2x, and the 720px column at 2x. */
const COVER_WIDTHS = [480, 960, 1440] as const;

const dayFormat = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric" });

function wasUpdated(post: BlogPostView): boolean {
  if (!post.publishedAt || !post.updatedAt) return false;
  return new Date(post.updatedAt).getTime() - new Date(post.publishedAt).getTime() >= UPDATE_THRESHOLD_MS;
}

export default function PostArticle({ post, related, banner }: { post: BlogPostView; related: BlogPostSummary[]; banner?: ReactNode }) {
  const author = post.authorName || SiteMetadata.author;
  // contentHtml is sanitized on save and again by the loader; this only adds
  // chart SVGs and table scroll regions (lib/blog/render.ts).
  const bodyHtml = renderPostContent(post.contentHtml);
  const toc = extractToc(bodyHtml);

  return (
    <article aria-labelledby="post-title" className="w-full pb-16 pt-[clamp(6.5rem,12vw,9rem)]">
      <HomeContainer>
        <div className="mx-auto max-w-[72ch]">
          {banner}
          <nav aria-label="Breadcrumb" className="text-sm opacity-70">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:underline">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/updates" className="hover:underline">
                  Updates
                </Link>
              </li>
            </ol>
          </nav>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm opacity-70">
            <span className="rounded-full bg-bICON_FADE px-3 py-1 text-xs font-semibold text-bICON">
              {post.topic}
            </span>
            <span>{post.readMinutes} min read</span>
          </div>

          <h1
            id="post-title"
            className="mt-4 text-balance text-[length:clamp(2rem,1.1rem+3.6vw,3.25rem)] font-semibold leading-[1.08] tracking-[-0.02em]"
          >
            {post.title}
          </h1>

          <p className="mt-4 text-sm opacity-70">
            By <span className="font-semibold">{author}</span>
            {post.publishedAt ? (
              <>
                {" · "}
                <time dateTime={post.publishedAt}>{dayFormat.format(new Date(post.publishedAt))}</time>
              </>
            ) : post.date ? (
              <> · {post.date}</>
            ) : null}
            {wasUpdated(post) ? (
              <>
                {" · Updated "}
                <time dateTime={post.updatedAt!}>{dayFormat.format(new Date(post.updatedAt!))}</time>
              </>
            ) : null}
          </p>

          {post.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary or LOCAL asset, not build-time optimized here
            <img
              src={cloudinaryImageUrl(post.coverUrl, { width: 1440 })}
              srcSet={cloudinarySrcSet(post.coverUrl, COVER_WIDTHS)}
              // The article column is at most 72ch (~720px) wide.
              sizes="(min-width: 800px) 720px, 100vw"
              alt={post.coverAlt || ""}
              width={post.coverWidth}
              height={post.coverHeight}
              // The cover is this page's largest paint: fetch it first, never lazily.
              fetchPriority="high"
              decoding="async"
              className="mt-8 h-auto w-full rounded-[20px] border border-bBORDERFADE object-cover"
            />
          ) : null}

          {toc.length >= 3 ? (
            <nav aria-labelledby="toc-title" className="mt-8 rounded-[20px] border border-bBORDERFADE bg-bCARD p-5 text-sm">
              <p id="toc-title" className="text-xs font-semibold uppercase tracking-[0.08em] opacity-70">
                On this page
              </p>
              <ol className="mt-3 space-y-1.5">
                {toc.map((item) => (
                  <li key={item.id} className={item.level === 3 ? "pl-4 opacity-80" : undefined}>
                    <a href={`#${item.id}`} className="hover:text-bICON hover:underline">
                      {item.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}

          <div
            className="post-content mt-8 text-[15px] s768:text-[17px]"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          {post.tags.length > 0 ? (
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Tags">
              {post.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-bBORDERFADE bg-bCHIP px-3 py-1 text-xs font-medium"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}

          {related.length > 0 ? (
            <section aria-labelledby="related-title" className="mt-14 border-t border-bBORDERFADE pt-8">
              <h2 id="related-title" className="text-lg font-semibold">
                Related updates
              </h2>
              <ul className="mt-4 space-y-4">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link href={`/updates/${item.slug}`} className="group block">
                      <span className="font-semibold group-hover:underline">{item.title}</span>
                      <span className="mt-1 block text-sm opacity-70">{item.excerpt}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </HomeContainer>
    </article>
  );
}
