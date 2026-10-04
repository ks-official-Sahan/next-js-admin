import { blogAiEnabled, blogAiImagesEnabled } from "@/lib/ai/availability";
import { hasPermission, requirePermission } from "@/lib/auth/dal";
import { createPostAction } from "@/lib/actions/blog";
import { repos } from "@/lib/data";
import { SiteMetadata } from "@/config/site";

import BlogEditorForm from "@/components/admin/blog/BlogEditorForm";

export const metadata = { title: "New post" };

async function loadTaxonomy() {
  const [topics, tagLists] = await Promise.all([repos.posts.topics(), repos.posts.tagLists(200)]);
  return {
    topics: topics.filter(Boolean),
    tags: [...new Set(tagLists.flat())].sort(),
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
