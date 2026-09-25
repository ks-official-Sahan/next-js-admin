import { notFound } from "next/navigation";

import { hasPermission, requirePermission } from "@/lib/auth/dal";
import { db } from "@/lib/db/prisma";
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
  const [topicRows, tagRows] = await Promise.all([
    db.post.findMany({ distinct: ["topic"], select: { topic: true }, orderBy: { topic: "asc" } }),
    db.post.findMany({ where: { id: { not: excludeId } }, select: { tags: true }, take: 200 }),
  ]);
  return {
    topics: topicRows.map((row) => row.topic).filter(Boolean),
    tags: [...new Set(tagRows.flatMap((row) => row.tags))].sort(),
  };
}

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("editBlog");

  // One round trip of independent reads: none of them needs the post first.
  const [post, { topics, tags }, revisions] = await Promise.all([
    db.post.findUnique({ where: { id }, include: { coverMedia: { select: { url: true } } } }),
    loadTaxonomy(id),
    listPostRevisions(id),
  ]);
  if (!post) notFound();

  const canPublish = hasPermission(user, "publishBlog");
  const canDelete = hasPermission(user, "deleteBlog");
  const siteUrl = new URL(SiteMetadata.siteUrl).host;

  // A restore writes a "restore" revision; keying the editor on the newest
  // one remounts it with the restored fields. An ordinary save never changes
  // this key, so saving never resets the editor mid-typing.
  const editorKey = revisions.find((revision) => revision.reason === "restore")?.id ?? "base";

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-6">
      <BlogEditorForm
        key={editorKey}
        action={updatePostAction}
        canUseAi={hasPermission(user, "generateAI")}
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
