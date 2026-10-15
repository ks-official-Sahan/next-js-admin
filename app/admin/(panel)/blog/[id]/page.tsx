import { notFound } from "next/navigation";

import { blogAiEnabled, blogAiImagesEnabled } from "@/lib/ai/availability";
import { auditQueryString } from "@/lib/admin/audit-filters";
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
import ShareLinkCard from "@/components/admin/blog/ShareLinkCard";
import { sanitizeRich } from "@/lib/cms/rich-text";

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
  // Status changes live in the audit log, not in revisions (RevisionHistoryCard).
  const activityHref = hasPermission(user, "viewAuditLogs")
    ? `/admin/audit${auditQueryString({ entityType: "Post", entityId: post.id })}`
    : undefined;

  // A restore writes a "restore" revision; keying the editor on the newest
  // one remounts it with the restored fields. An ordinary save never changes
  // this key, so saving never resets the editor mid-typing.
  const editorKey = revisions.find((revision) => revision.reason === "restore")?.id ?? "base";

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-6">
      {post.status !== "DRAFT" && !canPublish ? (
        <section aria-labelledby="post-readonly-title" className="space-y-4 rounded-lg border border-border p-6">
          <p role="status" className="text-sm text-muted-foreground">
            This post is {post.status.toLowerCase()}. Your role can edit drafts only.
          </p>
          <h1 id="post-readonly-title" className="text-2xl font-semibold">{post.title}</h1>
          <article
            className="post-content"
            dangerouslySetInnerHTML={{ __html: sanitizeRich(post.contentHtml) }}
          />
        </section>
      ) : (
      <BlogEditorForm
        key={editorKey}
        action={updatePostAction}
        canUseAi={canUseAi}
        canGenerateImages={canUseAi && blogAiImagesEnabled()}
        canPublish={canPublish}
        existingTopics={topics}
        existingTags={tags}
        siteUrl={siteUrl}
        statusPanel={canPublish || canDelete ? (
          <PostStatusControls
            status={post.status}
            publishAt={post.publishAt?.toISOString() ?? null}
            canPublish={canPublish}
            canDelete={canDelete}
          />
        ) : <span className={badgeClass}>{post.status}</span>}
        historyPanel={
          <>
            <ShareLinkCard postId={post.id} />
            <RevisionHistoryCard postId={post.id} revisions={revisions} activityHref={activityHref} />
          </>
        }
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
      )}

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
