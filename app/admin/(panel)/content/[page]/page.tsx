import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import SectionEditor from "@/components/admin/cms/SectionEditor";
import { badgeClass, cardClass } from "@/components/admin/ui/styles";
import { CMS_PAGE_INFO } from "@/lib/admin/cms-pages";
import { hasPermission, requirePermission } from "@/lib/auth/dal";
import { isCmsPage, sectionsOf } from "@/lib/cms/registry";
import { loadEditorSection } from "@/lib/cms/service";

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  const { page } = await params;
  return { title: isCmsPage(page) ? `${CMS_PAGE_INFO[page].label} content` : "Content" };
}

export default async function ContentPageEditor({ params }: { params: Promise<{ page: string }> }) {
  const actor = await requirePermission("editPages");
  const { page } = await params;
  if (!isCmsPage(page)) notFound();

  const info = CMS_PAGE_INFO[page];
  const definitions = Object.values(sectionsOf(page));
  const editors = await Promise.all(definitions.map((definition) => loadEditorSection(definition)));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <Link href="/admin/content" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          All pages
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{info.label} page</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a section to change its wording. Visitors see a section only after it is published. Public page:{" "}
          <a href={info.path} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {info.path}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </div>

      <div className="space-y-3">
        {definitions.map((definition, index) => {
          const editor = editors[index];
          const draft = editor.source === "draft";
          return (
            <details key={definition.key} open={draft} className={`${cardClass} group`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span>
                  <span className="block text-base font-medium">{definition.label}</span>
                  {definition.description ? (
                    <span className="mt-0.5 block text-sm text-muted-foreground">{definition.description}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {draft ? <span className={badgeClass}>Draft</span> : null}
                  <span className="text-xs text-muted-foreground">
                    {editor.publishedVersion ? `Live v${editor.publishedVersion}` : "Site default"}
                  </span>
                </span>
              </summary>
              <div className="mt-5 border-t border-border pt-5">
                <SectionEditor
                  page={page}
                  section={definition.key}
                  label={definition.label}
                  fields={definition.fields}
                  initial={editor.initial}
                  base={editor.base}
                  source={editor.source}
                  publishedVersion={editor.publishedVersion}
                  history={editor.history}
                  ignoredReason={editor.ignoredReason}
                  canEdit={hasPermission(actor, definition.editPermission)}
                  canPublish={hasPermission(actor, definition.publishPermission)}
                  previewHref={`/preview/${page}`}
                />
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
