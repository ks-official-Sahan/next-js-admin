import { blogAiEnabled, blogAiImagesEnabled } from "@/lib/ai/availability";
import { hasPermission, requirePermission } from "@/lib/auth/dal";
import { createPostAction } from "@/lib/actions/blog";
import { db } from "@/lib/db/prisma";
import { SiteMetadata } from "@/config/site";

import BlogEditorForm from "@/components/admin/blog/BlogEditorForm";

export const metadata = { title: "New post" };

async function loadTaxonomy() {
  const [topicRows, tagRows] = await Promise.all([
    db.post.findMany({ distinct: ["topic"], select: { topic: true }, orderBy: { topic: "asc" } }),
    db.post.findMany({ select: { tags: true }, take: 200 }),
  ]);
  return {
    topics: topicRows.map((row) => row.topic).filter(Boolean),
    tags: [...new Set(tagRows.flatMap((row) => row.tags))].sort(),
  };
}

export default async function NewBlogPostPage() {
  const user = await requirePermission("editBlog");
  const { topics, tags } = await loadTaxonomy();
  const siteUrl = new URL(SiteMetadata.siteUrl).host;
  const canUseAi = hasPermission(user, "generateAI") && blogAiEnabled();

  return (
    <div className="mx-auto w-full max-w-[1800px]">
      <BlogEditorForm
        action={createPostAction}
        canUseAi={canUseAi}
        canGenerateImages={canUseAi && blogAiImagesEnabled()}
        canPublish={hasPermission(user, "publishBlog")}
        existingTopics={topics}
        existingTags={tags}
        siteUrl={siteUrl}
      />
    </div>
  );
}
