import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PostArticle from "@/components/updates/PostArticle";
import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { getPostPreview } from "@/lib/blog/queries";
import { deriveShareKey, verifyShareToken } from "@/lib/blog/share-link";
import { env } from "@/lib/env";

// A post as readers will see it, before it is public: open to anyone holding
// a signed share link (?t=, lib/blog/share-link.ts) for this post, and to
// signed-in editors. Anything else is a 404, never a "link expired" page, so
// the route does not confirm a post id exists. It shows drafts, so it is
// rendered per request, kept out of search results, and sends no Referer
// (the token is in the URL).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Post preview",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const POST_ID = /^[\w-]{1,64}$/;

async function signedInEditor(): Promise<boolean> {
  const user = await getOptionalUser();
  return Boolean(user && !user.mustChangePassword && hasPermission(user, "editBlog"));
}

export default async function PostPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!POST_ID.test(id)) notFound();
  const token = typeof query.t === "string" ? query.t : null;
  // Without AUTH_SECRET (local dev) no link can verify; editors still can.
  const secret = env.AUTH_SECRET;
  const allowed = (secret ? verifyShareToken(id, token, deriveShareKey(secret)) : false) || (await signedInEditor());
  if (!allowed) notFound();

  const post = await getPostPreview(id);
  if (!post) notFound();

  return (
    <div className="w-full overflow-hidden font-medium">
      <PostArticle
        post={post}
        related={[]}
        banner={
          <p role="status" className="mb-6 rounded-[14px] border border-bBORDERFADE bg-bCARD px-4 py-3 text-sm">
            Preview. This post may not be published yet, and what you see can still change.
          </p>
        }
      />
    </div>
  );
}
