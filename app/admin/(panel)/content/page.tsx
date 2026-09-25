import type { Metadata } from "next";
import Link from "next/link";

import { badgeClass, cardClass } from "@/components/admin/ui/styles";
import { CMS_PAGE_INFO } from "@/lib/admin/cms-pages";
import { requirePermission } from "@/lib/auth/dal";
import { CMS_PAGES } from "@/lib/cms/registry";
import { loadPageSummary } from "@/lib/cms/service";

export const metadata: Metadata = { title: "Content" };

export default async function ContentPage() {
  await requirePermission("editPages");
  const summaries = await Promise.all(CMS_PAGES.map((page) => loadPageSummary(page)));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit the words on each public page. Changes stay drafts until they are published, and every change is written
          to the audit log.
        </p>
      </div>

      <ul className="grid gap-4 s640:grid-cols-2">
        {CMS_PAGES.map((page, index) => {
          const info = CMS_PAGE_INFO[page];
          const sections = summaries[index];
          const drafts = sections.filter((section) => section.hasDraft).length;
          const live = sections.filter((section) => section.publishedVersion !== null).length;
          return (
            <li key={page}>
              <Link
                href={`/admin/content/${page}`}
                className={`${cardClass} block h-full transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-base font-medium">{info.label}</span>
                  {drafts > 0 ? (
                    <span className={badgeClass}>
                      {drafts} {drafts === 1 ? "draft" : "drafts"}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{info.blurb}</span>
                <span className="mt-3 block text-xs text-muted-foreground">
                  {sections.length} sections, {live} edited and published
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
