"use client";

import { Field } from "@/components/admin/ui/ActionForm";
import { fieldClass } from "@/components/admin/ui/styles";
import { cn } from "@/lib/utils";

import SidebarCard from "./SidebarCard";

// "SEO & Metadata" card: excerpt, SEO title/description with live counters,
// a canonical URL, and a Google-style search-result snippet preview built
// from the same fields — so the admin sees exactly what a truncated title or
// an over-length description will look like before publishing, not just a
// character count.

/** Live character counter with a soft warning colour outside the aim range. Never blocks input — the field's own `maxLength` is the hard cap. */
function FieldCounter({ id, value, max, aim }: { id: string; value: string; max: number; aim?: { min?: number; max: number } }) {
  const length = value.length;
  const warn = aim ? length > aim.max || (aim.min !== undefined && length > 0 && length < aim.min) : false;
  return (
    <p id={id} className={cn("mt-1 text-right text-xs tabular-nums", warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
      {length}/{max}
    </p>
  );
}

export default function SeoCard({
  title,
  slug,
  siteUrl,
  excerpt,
  onExcerptChange,
  seoTitle,
  onSeoTitleChange,
  seoDescription,
  onSeoDescriptionChange,
  canonicalUrl,
  canUseAi,
  seoBusy,
  seoError,
  onSuggest,
}: {
  title: string;
  slug: string;
  siteUrl: string;
  excerpt: string;
  onExcerptChange: (value: string) => void;
  seoTitle: string;
  onSeoTitleChange: (value: string) => void;
  seoDescription: string;
  onSeoDescriptionChange: (value: string) => void;
  canonicalUrl: string;
  canUseAi: boolean;
  seoBusy: boolean;
  seoError: string | null;
  onSuggest: () => void;
}) {
  return (
    <SidebarCard
      title="SEO & Metadata"
      actions={
        canUseAi ? (
          <button
            type="button"
            onClick={onSuggest}
            disabled={seoBusy || !title}
            className="rounded-md border border-input bg-background px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
          >
            {seoBusy ? "Suggesting…" : "✨ Suggest SEO"}
          </button>
        ) : undefined
      }
    >
      {seoError ? <p className="mb-2 text-xs text-destructive">{seoError}</p> : null}

      <label htmlFor="excerpt" className="text-sm font-medium">
        Excerpt (short summary)
      </label>
      <textarea
        id="excerpt"
        name="excerpt"
        value={excerpt}
        onChange={(event) => onExcerptChange(event.target.value)}
        maxLength={500}
        aria-describedby="excerpt-counter"
        className={cn(fieldClass, "mt-1.5 min-h-20 py-2")}
      />
      <FieldCounter id="excerpt-counter" value={excerpt} max={500} />

      <label htmlFor="seoTitle" className="mt-3 block text-sm font-medium">
        SEO title
      </label>
      <input
        id="seoTitle"
        name="seoTitle"
        value={seoTitle}
        onChange={(event) => onSeoTitleChange(event.target.value)}
        maxLength={70}
        placeholder="Defaults to post title"
        aria-describedby="seoTitle-counter"
        className={cn(fieldClass, "mt-1.5")}
      />
      <FieldCounter id="seoTitle-counter" value={seoTitle} max={70} aim={{ max: 60 }} />

      <label htmlFor="seoDescription" className="mt-3 block text-sm font-medium">
        SEO description
      </label>
      <textarea
        id="seoDescription"
        name="seoDescription"
        value={seoDescription}
        onChange={(event) => onSeoDescriptionChange(event.target.value)}
        maxLength={200}
        aria-describedby="seoDescription-counter"
        className={cn(fieldClass, "mt-1.5 min-h-16 py-2")}
      />
      <FieldCounter id="seoDescription-counter" value={seoDescription} max={200} aim={{ min: 120, max: 160 }} />

      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Google search preview</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
            {siteUrl.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate">
            {siteUrl} › updates › {slug || "…"}
          </span>
        </div>
        <p className="mt-1 truncate text-lg text-[#1a0dab] dark:text-[#8ab4f8]">{seoTitle || title || "Untitled post"}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-[#4d5156] dark:text-[#bdc1c6]">{seoDescription || excerpt || "No description yet."}</p>
      </div>

      <Field label="Canonical URL" name="canonicalUrl" defaultValue={canonicalUrl} hint="Only needed if this post was published elsewhere first." className="mt-3" />
    </SidebarCard>
  );
}
