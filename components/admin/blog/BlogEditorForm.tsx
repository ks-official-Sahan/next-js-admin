"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, Eye } from "lucide-react";

import ActionForm, { Field, SubmitButton } from "@/components/admin/ui/ActionForm";
import type { ActionState } from "@/lib/actions/state";
import { buttonVariants, cardClass } from "@/components/admin/ui/styles";
import { draftStorageKey, isDraftNewer } from "@sahan-sac/blog-kit/draft";
import { slugify } from "@sahan-sac/blog-kit/slug";
import { cn } from "@/lib/utils";

import AiAssistantCard, { type AiPatch } from "./AiAssistantCard";
import BodyEditorCard from "./BodyEditorCard";
import FeaturedImageCard from "./FeaturedImageCard";
import PostPreviewPane from "./PostPreviewPane";
import PublishingCard, { PublishButton } from "./PublishingCard";
import SeoCard from "./SeoCard";
import SidebarCard from "./SidebarCard";

// The blog post editor: create and update share this component (per the
// task, "new and edit should share the same editor component"). A calm,
// dense editor in the Linear/Notion/Ghost mold: a sticky top bar (save
// state, Preview toggle, the primary/secondary submit actions) over a large
// borderless title, the body editor, the AI assistant, and a collapsible
// sidebar (SidebarCard) of Featured image / Publishing / SEO cards. Field
// changes go through createPostAction/updatePostAction as before; the AI
// Assistant card only ever writes into this component's own state via
// onPatch — it never talks to the database directly.

export interface EditablePost {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  topic: string;
  tags: string[];
  coverMediaId: string;
  coverAlt: string;
  /** Existing cover image URL, so the edit page's Featured image card shows what is already set. */
  coverSrc?: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  /** Kept out of search results, sitemap, RSS and llms.txt; still readable by URL. */
  noindex?: boolean;
  status?: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
  /** ISO `updatedAt`, carried in a hidden field for updatePostAction's optimistic-concurrency check. Absent for a new, unsaved post. */
  updatedAt?: string;
}

const EMPTY_POST: EditablePost = {
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  topic: "",
  tags: [],
  coverMediaId: "",
  coverAlt: "",
  seoTitle: "",
  seoDescription: "",
  canonicalUrl: "",
  noindex: false,
  status: "DRAFT",
};

// ─── Local autosave (browser-only; never sent to the server) ───────────────
// Keyed per post id ("new" for the create form) via lib/blog/draft.ts's
// draftStorageKey. Every access is wrapped in try/catch: private browsing,
// disabled storage, or a full quota must never break the editor.

interface StoredDraft {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  topic: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  coverMediaId: string;
  coverAlt: string;
  coverSrc: string | null;
  /** Absent in drafts saved before the field existed. */
  noindex?: boolean;
  savedAt: string;
}

function readDraftRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseDraft(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (!parsed || typeof parsed.savedAt !== "string" || typeof parsed.title !== "string") return null;
    return parsed as StoredDraft;
  } catch {
    return null;
  }
}

// localStorage has no same-tab change event worth subscribing to; the value
// is re-read on each render instead (useSyncExternalStore's snapshot).
const subscribeNever = () => () => {};

function writeDraft(key: string, draft: StoredDraft): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Private mode, disabled storage, or over quota — autosave is a nicety, not a requirement.
  }
}

function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Same as above: never let a storage failure surface as an editor error.
  }
}

// ─── Save-state text ("Saved • 2m ago" / "Unsaved changes") ────────────────

const RELATIVE_TIME = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function relativeTime(from: Date, now: Date): string {
  const seconds = Math.round((from.getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return RELATIVE_TIME.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return RELATIVE_TIME.format(hours, "hour");
  return RELATIVE_TIME.format(Math.round(hours / 24), "day");
}

/** Rendered inside the ActionForm it reports on, so useFormStatus() reads that form's own pending state directly — no prop threading needed. */
function SaveState({ dirty, savedAt }: { dirty: boolean; savedAt: Date | null }) {
  const { pending } = useFormStatus();
  // Ticks once a minute purely so the relative "Xm ago" text stays fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const text = pending ? "Saving…" : dirty ? "Unsaved changes" : savedAt ? `Saved • ${relativeTime(savedAt, new Date())}` : "Not saved yet";
  return (
    <span role="status" aria-live="polite" className={cn("text-xs", dirty && !pending ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
      {text}
    </span>
  );
}

export default function BlogEditorForm({
  action,
  post,
  canUseAi,
  canGenerateImages = false,
  canPublish = false,
  existingTopics = [],
  existingTags = [],
  siteUrl,
  statusPanel,
  historyPanel,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  post?: EditablePost;
  /** The blog AI assistant is on (ENABLE_BLOG_AI, a provider key) and this actor holds generateAI. */
  canUseAi: boolean;
  /** An image provider is configured too: the image options and the featured-image generator show. */
  canGenerateImages?: boolean;
  /** Whether this actor can publish/schedule (hasPermission(user, "publishBlog")). */
  canPublish?: boolean;
  /** Distinct topics already in use, offered as chips. */
  existingTopics?: string[];
  /** Recently used tags, offered as suggestions. */
  existingTags?: string[];
  /** This site's own origin, e.g. "example.com" — for the "<site>/updates/<slug>" line. */
  siteUrl: string;
  /** Edit page only: publish/schedule/archive controls, rendered inside the Publishing card. Buttons with a formAction, never a nested <form>. */
  statusPanel?: ReactNode;
  /** Edit page only: the saved-versions card (RevisionHistoryCard). */
  historyPanel?: ReactNode;
}) {
  const initial = post ?? EMPTY_POST;
  const storageKey = draftStorageKey(post?.id);

  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [content, setContent] = useState(initial.content);
  const [topic, setTopic] = useState(initial.topic);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle);
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription);
  const [coverMediaId, setCoverMediaId] = useState(initial.coverMediaId);
  const [coverSrc, setCoverSrc] = useState<string | null>(initial.coverSrc ?? null);
  const [coverAlt, setCoverAlt] = useState(initial.coverAlt);
  const [coverBusy, setCoverBusy] = useState(false);
  const [generatedByAI, setGeneratedByAI] = useState(false);
  const [seoBusy, setSeoBusy] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);
  const [noindex, setNoindex] = useState(initial.noindex ?? false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Optimistic concurrency: re-armed with the fresh value updatePostAction
  // returns after each successful save, so a second save right after the
  // first is never falsely flagged as a conflict.
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt ?? "");
  const [savedAt, setSavedAt] = useState<Date | null>(initial.updatedAt ? new Date(initial.updatedAt) : null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Unsaved-changes tracking, derived rather than stored: the form is dirty
  // when its fields differ from the last saved (or first loaded) values. No
  // "skip the first effect run" flag, so React's dev double-invoke of effects
  // can't mark a freshly opened post as edited.
  const snapshotKey = JSON.stringify({ title, slug, excerpt, content, topic, tags, seoTitle, seoDescription, coverMediaId, coverAlt, coverSrc, noindex });
  const [savedKey, setSavedKey] = useState(snapshotKey);
  const dirty = snapshotKey !== savedKey;

  // Local autosave, one second after the last change, only while dirty.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      const fields = JSON.parse(snapshotKey) as Omit<StoredDraft, "savedAt">;
      writeDraft(storageKey, { ...fields, savedAt: new Date().toISOString() });
    }, 1000);
    return () => clearTimeout(timer);
  }, [dirty, snapshotKey, storageKey]);

  // Offer a locally saved draft if it postdates what the server has
  // (lib/blog/draft.ts's isDraftNewer). Read through useSyncExternalStore so
  // the server render and hydration agree (no draft), then the browser shows
  // it. Once the admin edits, autosave overwrites that draft anyway, so the
  // offer is withdrawn rather than left pointing at data that is gone.
  const draftRaw = useSyncExternalStore(subscribeNever, () => readDraftRaw(storageKey), () => null);
  const [draftDismissed, setDraftDismissed] = useState(false);
  const pendingDraft = useMemo(() => {
    if (dirty || draftDismissed) return null;
    const stored = parseDraft(draftRaw);
    return stored && isDraftNewer(stored.savedAt, initial.updatedAt ?? null) ? stored : null;
  }, [dirty, draftDismissed, draftRaw, initial.updatedAt]);

  // Creating a post ends in a server-side redirect (createPostAction), so
  // handleResult never runs for the create form and its "new" draft would be
  // offered again on the next new post. The edit page of the post that draft
  // produced clears it: same slug, and slugs are unique.
  const createdSlug = post?.id ? initial.slug : null;
  useEffect(() => {
    if (!createdSlug) return;
    const newKey = draftStorageKey(undefined);
    if (parseDraft(readDraftRaw(newKey))?.slug === createdSlug) clearDraft(newKey);
  }, [createdSlug]);

  // Warn on a hard navigation (refresh/close-tab) while there is something
  // unsaved to lose.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Warn on an in-app navigation too (clicking a sidebar link, "Back to
  // posts", etc.): Next's App Router has no imperative "confirm before
  // navigating" hook, so this listens for a same-page anchor click in the
  // capture phase and asks first, closing over the same `dirty` state
  // beforeunload uses. Same-page hash links (PostPreviewPane's table of
  // contents) just scroll, so they're excluded rather than falsely confirmed.
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      if (!dirty) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]");
      const href = anchor?.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (!window.confirm("You have unsaved changes. Leave this page?")) event.preventDefault();
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [dirty]);

  // Keyboard shortcuts: Ctrl/Cmd+S saves, Ctrl/Cmd+Shift+P toggles Preview.
  // ActionForm (components/admin/ui/ActionForm.tsx) owns the <form> element
  // and doesn't forward a ref, so Ctrl/Cmd+S finds it the same way any
  // keyboard shortcut would target a form it doesn't own: by DOM query
  // within this component's own root.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (!meta) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        rootRef.current?.querySelector("form")?.requestSubmit();
      } else if (event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPreviewOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleResult(state: ActionState) {
    if (!state.ok) return;
    if (state.updatedAt) setUpdatedAt(state.updatedAt);
    clearDraft(storageKey);
    setSavedKey(snapshotKey);
    setSavedAt(new Date());
  }

  function applyDraft() {
    if (!pendingDraft) return;
    setTitle(pendingDraft.title);
    setSlug(pendingDraft.slug);
    setSlugTouched(true);
    setExcerpt(pendingDraft.excerpt);
    setContent(pendingDraft.content);
    setTopic(pendingDraft.topic);
    setTags(pendingDraft.tags);
    setSeoTitle(pendingDraft.seoTitle);
    setSeoDescription(pendingDraft.seoDescription);
    setCoverMediaId(pendingDraft.coverMediaId);
    setCoverAlt(pendingDraft.coverAlt);
    setCoverSrc(pendingDraft.coverSrc);
    if (typeof pendingDraft.noindex === "boolean") setNoindex(pendingDraft.noindex);
    setDraftDismissed(true);
  }

  function discardDraft() {
    clearDraft(storageKey);
    setDraftDismissed(true);
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleAiPatch(patch: AiPatch) {
    switch (patch.type) {
      case "start":
        setGeneratedByAI(true);
        break;
      case "meta":
        setTitle(patch.title);
        setSlug(patch.slug);
        setSlugTouched(true);
        setExcerpt(patch.excerpt);
        setSeoTitle(patch.seoTitle);
        setSeoDescription(patch.seoDescription);
        setTopic(patch.topic);
        setTags(patch.tags);
        break;
      case "body":
        setContent(patch.html);
        break;
      case "featuredAlt":
        setCoverAlt((current) => current || patch.alt);
        break;
      case "featuredImageBusy":
        setCoverBusy(patch.busy);
        break;
      case "featuredImage":
        setCoverMediaId(patch.mediaId);
        setCoverSrc(patch.url);
        setCoverAlt(patch.alt);
        break;
      case "error":
        break;
    }
  }

  async function suggestSeo() {
    setSeoBusy(true);
    setSeoError(null);
    try {
      const response = await fetch("/api/admin/ai/seo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, contentText: excerpt || content.replace(/<[^>]+>/g, " ").slice(0, 4000) }),
      });
      const data = (await response.json()) as { ok: boolean; seoTitle?: string; seoDescription?: string; excerpt?: string; error?: string };
      if (!data.ok || !data.seoTitle) {
        setSeoError(data.error || "Could not suggest SEO fields.");
        return;
      }
      setSeoTitle(data.seoTitle);
      setSeoDescription(data.seoDescription || "");
      if (!excerpt && data.excerpt) setExcerpt(data.excerpt);
    } catch {
      setSeoError("The AI assistant is unreachable right now.");
    } finally {
      setSeoBusy(false);
    }
  }

  const previewData = { title, excerpt, topic, coverSrc, coverAlt, html: content };

  return (
    <div ref={rootRef}>
    <ActionForm action={action} onResult={handleResult} className="space-y-6">
      {post?.id ? <input type="hidden" name="id" defaultValue={post.id} /> : null}
      {post?.id ? <input type="hidden" name="updatedAt" value={updatedAt} /> : null}
      <input type="hidden" name="content" value={content} />
      <input type="hidden" name="topic" value={topic} />
      <input type="hidden" name="tags" value={tags.join(",")} />
      <input type="hidden" name="coverMediaId" value={coverMediaId} />
      <input type="hidden" name="coverAlt" value={coverAlt} />
      <input type="hidden" name="generatedByAI" value={generatedByAI ? "1" : "0"} />

      {/* Sticky top bar: breadcrumb, save state, Preview toggle, the primary/secondary submit actions. Sits just under AdminShell's own Topbar (h-14, z-30). */}
      <div className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur s768:-mx-8 s768:px-8">
        <Link
          href="/admin/blog"
          aria-label="Back to posts"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-medium">{title || (post?.id ? "Edit post" : "New post")}</h1>
          <SaveState dirty={dirty} savedAt={savedAt} />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen((value) => !value)}
            aria-pressed={previewOpen}
            className={cn(buttonVariants.secondary, "gap-1.5")}
            title="Preview (Ctrl/Cmd+Shift+P)"
          >
            <Eye size={15} aria-hidden />
            Preview
          </button>

          {statusPanel ? (
            <span title="Save (Ctrl/Cmd+S)">
              <SubmitButton pendingLabel="Saving…">{post?.id ? "Update" : "Save"}</SubmitButton>
            </span>
          ) : (
            <>
              <PublishButton intent="draft" canPublish={canPublish} label="Save draft" pendingLabel="Saving…" />
              <PublishButton intent="publish" canPublish={canPublish} label="Publish now" pendingLabel="Publishing…" />
            </>
          )}
        </div>
      </div>

      {pendingDraft ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <span>
            You have unsaved changes from {new Date(pendingDraft.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={applyDraft} className={buttonVariants.small}>
              Restore unsaved draft
            </button>
            <button type="button" onClick={discardDraft} className={buttonVariants.small}>
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {/* Whole-post preview opens full screen over the editor, which stays
          mounted underneath: every named field remains in the form, so a
          Ctrl/Cmd+S while previewing saves exactly what is being edited. */}
      {previewOpen ? <PostPreviewPane post={previewData} defaultExpanded onCollapse={() => setPreviewOpen(false)} /> : null}

      <div>
        {/* One column below xl; from xl the sidebar sits beside the main
            column and scrolls on its own, so long posts keep it in reach. */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* Main column */}
          <div className="min-w-0 space-y-6">
            <div className={cardClass}>
              <label htmlFor="post-title" className="sr-only">
                Post title
              </label>
              <input
                id="post-title"
                name="title"
                value={title}
                onChange={(event) => handleTitleChange(event.target.value)}
                placeholder="Post Title…"
                required
                maxLength={200}
                className="w-full border-0 bg-transparent text-2xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground focus-visible:outline-none s768:text-3xl"
              />
              <div className="mt-2 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <span>{siteUrl}/updates/</span>
                <input
                  name="slug"
                  value={slug}
                  onChange={(event) => {
                    setSlug(slugify(event.target.value));
                    setSlugTouched(true);
                  }}
                  required
                  maxLength={96}
                  aria-label="Slug"
                  className="min-w-0 flex-1 border-0 bg-transparent font-mono text-sm text-primary focus-visible:outline-none"
                />
              </div>
            </div>

            {canUseAi ? (
              <AiAssistantCard
                onPatch={handleAiPatch}
                existingContent={content}
                hasFeaturedImage={Boolean(coverMediaId)}
                imagesAvailable={canGenerateImages}
                // Open for a new, empty post; a slim collapsed bar once there is a body.
                defaultOpen={!initial.content.trim()}
              />
            ) : null}

            <BodyEditorCard content={content} onChange={setContent} />
          </div>

          {/* Sidebar: two columns of cards on tablets, one sticky column from xl. */}
          <div className="grid content-start gap-6 lg:grid-cols-2 xl:sticky xl:top-[8.5rem] xl:max-h-[calc(100dvh-9.5rem)] xl:grid-cols-1 xl:overflow-y-auto xl:overscroll-contain xl:pb-2 xl:pr-1">
            <FeaturedImageCard
              canGenerate={canGenerateImages}
              generating={coverBusy}
              src={coverSrc}
              alt={coverAlt}
              onAltChange={setCoverAlt}
              onSelect={(result) => {
                setCoverMediaId(result.mediaId);
                setCoverSrc(result.src);
                if (!coverAlt) setCoverAlt(result.alt);
              }}
              onClear={() => {
                setCoverMediaId("");
                setCoverSrc(null);
              }}
            />

            <PublishingCard
              status={initial.status ?? "DRAFT"}
              topic={topic}
              onTopicChange={setTopic}
              existingTopics={existingTopics}
              tags={tags}
              onTagsChange={setTags}
              existingTags={existingTags}
              statusPanel={statusPanel}
              canPublish={canPublish}
            />

            <SidebarCard title="Search visibility" defaultOpen={noindex}>
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="noindex"
                  checked={noindex}
                  onChange={(event) => setNoindex(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="font-medium">Hide from search engines</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Adds noindex and leaves the post out of the sitemap, RSS and llms.txt. Anyone with the link can still read it.
                  </span>
                </span>
              </label>
            </SidebarCard>

            {historyPanel}

            <SeoCard
              title={title}
              slug={slug}
              siteUrl={siteUrl}
              excerpt={excerpt}
              onExcerptChange={setExcerpt}
              seoTitle={seoTitle}
              onSeoTitleChange={setSeoTitle}
              seoDescription={seoDescription}
              onSeoDescriptionChange={setSeoDescription}
              canonicalUrl={initial.canonicalUrl}
              canUseAi={canUseAi}
              seoBusy={seoBusy}
              seoError={seoError}
              onSuggest={suggestSeo}
            />
          </div>
        </div>
      </div>
    </ActionForm>
    </div>
  );
}
