import FinalCta from "@/components/home/FinalCta";
import UpdatesPageView from "@/components/pages/UpdatesPageView";
import { getPageContent } from "@/lib/cms/loaders";
import { encodePublicPostCursor, getPublicPostPage } from "@/lib/blog/queries";
import React from "react";

// /updates: 300s revalidate (design notes, section 5.1), so a
// post published by hand or by the scheduled-publish cron appears within
// five minutes without a manual cache clear.
export const revalidate = 300;

const Updates = async () => {
  const [updates, home, postPage] = await Promise.all([
    getPageContent("updates"),
    getPageContent("home"),
    getPublicPostPage(20),
  ]);

  const finalCta = (
    <FinalCta key="final-cta" content={home.finalCta} channels={home.channels} />
  );

  const listPosts = postPage.items.map((post) => ({
    id: post.id,
    slug: post.slug,
    title: post.title,
    date: post.date,
    excerpt: post.excerpt,
    topic: post.topic,
    tags: post.tags,
  }));

  const nextCursor = postPage.nextCursor ? encodePublicPostCursor(postPage.nextCursor) : null;
  return <UpdatesPageView content={updates} posts={listPosts} nextCursor={nextCursor} finalCta={finalCta} />;
};

export default Updates;
