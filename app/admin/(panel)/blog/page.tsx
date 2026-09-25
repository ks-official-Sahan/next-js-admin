import Link from "next/link";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { hasPermission, requirePermission } from "@/lib/auth/dal";
import { listAdminPosts } from "@/lib/blog/admin-list";
import { parseAdminPostListParams } from "@/lib/blog/admin-list-params";
import { getServerQueryClient } from "@/lib/cache/query-client.server";
import { queryKeys } from "@/lib/cache/query-keys";
import { buttonVariants } from "@/components/admin/ui/styles";

import BlogListClient from "@/components/admin/blog/BlogListClient";

export const metadata = { title: "Blog" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BlogListPage({ searchParams }: PageProps) {
  const user = await requirePermission("viewBlog");

  const raw = await searchParams;
  const params = parseAdminPostListParams({
    get: (name) => {
      const value = raw[name];
      return typeof value === "string" ? value : null;
    },
  });

  // The first page is fetched here, on the server, and handed to the client's
  // React Query cache; the list's own later requests go to /api/admin/blog.
  const queryClient = getServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.admin.blogPosts.list(params),
    queryFn: () => listAdminPosts(params),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Blog</h1>
          <p className="text-sm text-muted-foreground">Updates shown on the public /updates page.</p>
        </div>
        {hasPermission(user, "editBlog") ? (
          <Link href="/admin/blog/new" className={buttonVariants.primary}>
            New post
          </Link>
        ) : null}
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <BlogListClient canPublish={hasPermission(user, "publishBlog")} canDelete={hasPermission(user, "deleteBlog")} />
      </HydrationBoundary>
    </div>
  );
}
