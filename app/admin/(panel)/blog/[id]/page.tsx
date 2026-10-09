import { notFound } from "next/navigation";

import { blogAiEnabled, blogAiImagesEnabled } from "@/lib/ai/availability";
import { hasPermission, requirePermission } from "@/lib/auth/dal";
import { repos } from "@/lib/data";
import { SiteMetadata } from "@/config/site";
import ActionForm, { ConfirmSubmitButton } from "@/components/admin/ui/ActionForm";
import { badgeClass } from "@/components/admin/ui/styles";
import { deletePostAction, updatePostAction } from "@/lib/actions/blog";
import { listPostRevisions } from "@/lib/blog/revision-queries";

import BlogEditorForm from "@/components/admin/blog/BlogEditorForm";
import PostStatusControls from "@/components/admin/blog/PostStatusControls";
import RevisionHistoryCard from "@/components/admin/blog/RevisionHistoryCard";

export const metadata = { title: "Edit post" };

async function loadTaxonomy(excludeId: string) {
  const [topics, tagLists] = await Promise.all([repos.posts.topics(), repos.posts.tagLists(200, excludeId)]);
  return {
    topics: topics.filter(Boolean),
    tags: [...new Set(tagLists.flat())].sort(),
  };
}

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("editBlog");

  // One round trip of independent reads: none of them needs the post first.
  const [post, { topics, tags }, revisions] = await Promise.all([
    repos.posts.findWithCoverUrl(id),
    loadTaxonomy(id),
    listPostRevisions(id),
  ]);
  if (!post) notFound();

  const canPublish = hasPermission(user, "publishBlog");
  const canDelete = hasPermission(user, "deleteBlog");
  const siteUrl = new URL(SiteMetadata.siteUrl).host;
  const canUseAi = hasPermission(user, "generateAI") && blogAiEnabled();

  // A restore writes a "restore" revision; keying the editor on the newest
  // one remounts it with the restored fields. An ordinary save never changes
  // this key, so saving never resets the editor mid-typing.
  const editorKey = revisions.find((revision) => revision.reason === "restore")?.id ?? "base";

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-6">
      <BlogEditorForm
        key={editorKey}
        action={updatePostAction}
        canUseAi={canUseAi}
        canGenerateImages={canUseAi && blogAiImagesEnabled()}
        canPublish={canPublish}
        existingTopics={topics}
        existingTags={tags}
        siteUrl={siteUrl}
        statusPanel={
          canPublish ? (
            <PostStatusControls status={post.status} publishAt={post.publishAt?.toISOString() ?? null} />
          ) : (
            <span className={badgeClass}>{post.status}</span>
          )
        }
        historyPanel={<RevisionHistoryCard postId={post.id} revisions={revisions} />}
        post={{
          id: post.id,
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt ?? "",
          content: post.content,
          topic: post.topic,
          tags: post.tags,
          coverMediaId: post.coverMediaId ?? "",
          coverAlt: post.coverAlt ?? "",
          coverSrc: post.coverMedia?.url,
          seoTitle: post.seoTitle ?? "",
          seoDescription: post.seoDescription ?? "",
          canonicalUrl: post.canonicalUrl ?? "",
          noindex: post.noindex,
          status: post.status,
          updatedAt: post.updatedAt.toISOString(),
        }}
      />

      {canDelete ? (
        <ActionForm action={deletePostAction} className="border-t border-border pt-6">
          <input type="hidden" name="id" value={post.id} />
          <ConfirmSubmitButton
            variant="danger"
            pendingLabel="Deleting…"
            confirmMessage={`Delete "${post.title}"? This cannot be undone.`}
          >
            Delete post
          </ConfirmSubmitButton>
        </ActionForm>
      ) : null}
    </div>
  );
}
