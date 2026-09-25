import FinalCta from "@/components/home/FinalCta";
import UpdatesPageView from "@/components/pages/UpdatesPageView";
import { getPageContent } from "@/lib/cms/loaders";
import { getPosts } from "@/lib/blog/queries";
import React from "react";

// /updates: 300s revalidate (design notes, section 5.1), so a
// post published by hand or by the scheduled-publish cron appears within
// five minutes without a manual cache clear.
export const revalidate = 300;

const Updates = async () => {
  const [updates, home, posts] = await Promise.all([
    getPageContent("updates"),
    getPageContent("home"),
    getPosts(),
  ]);

  const finalCta = (
    <FinalCta content={home.finalCta} channels={home.channels} />
  );

  const listPosts = posts.map((post) => ({
    id: post.id,
    slug: post.slug,
    title: post.title,
    date: post.date,
    excerpt: post.excerpt,
    topic: post.topic,
    tags: post.tags,
  }));

  return <UpdatesPageView content={updates} posts={listPosts} finalCta={finalCta} />;
};

export default Updates;
