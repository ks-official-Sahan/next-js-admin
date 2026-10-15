"use server";

import { authorizeAction } from "@/lib/actions/guard";
import type { ActionState } from "@/lib/actions/state";
import { done, fail } from "@/lib/actions/state";
import { audit } from "@/lib/admin/audit";
import { deriveShareKey, SHARE_LINK_DAYS, shareExpiry, signShareToken, type ShareLinkDays } from "@/lib/blog/share-link";
import { SiteMetadata } from "@/config/site";
import { repos } from "@/lib/data";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

// Creates a signed preview link for a post (lib/blog/share-link.ts). Anyone
// who can edit posts can share one, the same people who can already read the
// draft. Nothing is stored; the audit row records who shared what and until when.

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export async function createPostShareLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const auth = await authorizeAction("editBlog");
  if (!auth.ok) return fail(auth.error);

  const postId = String(formData.get("postId") ?? "");
  const days = Number(formData.get("shareDays"));
  if (!postId) return fail("Post not found.");
  if (!(SHARE_LINK_DAYS as readonly number[]).includes(days)) return fail("Choose how long the link should work.");
  const secret = env.AUTH_SECRET;
  if (!secret) return fail("Share links need AUTH_SECRET to be set.");

  try {
    const post = await repos.posts.find(postId);
    if (!post) return fail("Post not found.");

    const expiresAt = shareExpiry(days as ShareLinkDays);
    const token = signShareToken(post.id, expiresAt, deriveShareKey(secret));
    await audit({
      action: "post.share_link_created",
      actor: auth.user,
      entityType: "Post",
      entityId: post.id,
      meta: { days, expiresAt: new Date(expiresAt).toISOString() },
    });
    return done(`Preview link created. It works until ${dateFormat.format(expiresAt)} UTC.`, {
      link: `${SiteMetadata.siteUrl}/preview/post/${post.id}?t=${token}`,
    });
  } catch (error) {
    log.error("share link failed", { error: error instanceof Error ? error.message : String(error) });
    return fail("Something went wrong. Please try again.");
  }
}
