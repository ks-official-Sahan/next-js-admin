import { ImageResponse } from "next/og";

import { SiteMetadata } from "@/config/site";
import { getPostBySlug, getPosts } from "@/lib/blog/queries";
import { cloudinaryImageUrl } from "@/lib/media/delivery";

// Per-post social card. Not a page — a sibling file-convention image next to
// app/(site)/updates/[slug]/page.tsx (that page is owned by another stream;
// this file only reads its data, never edits it or its metadata).
//
// File-based metadata always wins over generateMetadata()'s own
// `openGraph.images` (node_modules/next/dist/docs/.../generate-metadata.md:
// "File-based metadata has the higher priority and will override the
// metadata object and generateMetadata function"), so this renders the
// post's real cover photo when it has one — keeping today's behavior for
// posts with cover art — and only falls back to a generated title card for
// posts that have none, which previously fell through to the generic
// site-wide root image instead of anything post-specific.
//
// getPostBySlug()/getPosts() are the same cached reads the page itself uses
// (lib/blog/queries.ts), so this stays statically generated per the docs'
// "statically optimized ... unless request-time APIs or uncached data" rule
// — it never forces the route dynamic.
export const alt = "Post cover image";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (post?.coverUrl) {
    return new ImageResponse(
      // eslint-disable-next-line @next/next/no-img-element -- next/og's Satori renderer, not next/image
      <img
        // Pre-cropped JPEG at card size: Satori cannot read AVIF/WebP, and the original may be many MB.
        src={cloudinaryImageUrl(post.coverUrl, { ...size, format: "jpg" })}
        width={size.width}
        height={size.height}
        style={{ objectFit: "cover" }}
      />,
      { ...size }
    );
  }

  const title = post?.title ?? SiteMetadata.title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          backgroundColor: "#0a0a0a",
          backgroundImage: "radial-gradient(circle at 25% 15%, rgba(145,255,0,0.18), transparent 45%)",
          fontFamily: "sans-serif",
        }}
      >
        {post?.topic ? (
          <div
            style={{
              fontSize: 28,
              color: "#91FF00",
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            {post.topic}
          </div>
        ) : null}
        <div
          style={{
            fontSize: 60,
            color: "#ffffff",
            fontWeight: 800,
            marginTop: 24,
            lineHeight: 1.15,
            display: "flex",
            maxWidth: "90%",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#91FF00",
            marginTop: 60,
            display: "flex",
          }}
        >
          {SiteMetadata.siteUrl.replace("https://", "")}/updates
        </div>
      </div>
    ),
    { ...size }
  );
}
