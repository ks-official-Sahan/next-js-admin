"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";

import { buttonVariants, fieldClass, textareaClass } from "@/components/admin/ui/styles";
import { applyImageToken } from "@/lib/blog/ai-image-tokens";
import { markdownToHtml } from "@/lib/blog/markdown";
import { cn } from "@/lib/utils";

import SidebarCard from "./SidebarCard";

// "AI Assistant" card: one Generate click produces a complete post (title,
// slug, excerpt, structured Markdown body with inline image placeholders,
// SEO fields, topic, tags, and a featured-image prompt) via
// app/api/admin/ai/generate-post/route.ts, which streams staged
// Server-Sent Events. Images are requested after the text and resolved in
// parallel (per-image progress), never blocking the text from appearing.
// When the body already has content, Generate first asks Replace or Insert
// (work item 3's "diff-free Replace/Insert choice") rather than silently
// clobbering what's there.

export type Tone = "Professional" | "Friendly" | "Technical" | "Casual";
export type Length = "Short" | "Medium" | "Long";

export type AiPatch =
  | { type: "start" }
  | { type: "meta"; title: string; slug: string; excerpt: string; seoTitle: string; seoDescription: string; topic: string; tags: string[] }
  | { type: "body"; html: string }
  | { type: "featuredAlt"; alt: string }
  | { type: "featuredImageBusy"; busy: boolean }
  | { type: "featuredImage"; mediaId: string; url: string; alt: string }
  | { type: "error"; message: string };

interface ContentImageMeta {
  token: string;
  alt: string;
  caption?: string;
}

type ImageStatus = "start" | "done" | "error" | "unavailable";

function parseSseChunk(chunk: string): { event: string; data: unknown } | null {
  const eventMatch = chunk.match(/^event:\s*(.+)$/m);
  const dataMatch = chunk.match(/^data:\s*(.+)$/m);
  if (!eventMatch || !dataMatch) return null;
  try {
    return { event: eventMatch[1].trim(), data: JSON.parse(dataMatch[1]) };
  } catch {
    return null;
  }
}

/** A single row in the generation-progress stepper. */
function StepRow({ state, label }: { state: "pending" | "active" | "done"; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {state === "done" ? (
        <Check size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : state === "active" ? (
        <Loader2 size={13} className="shrink-0 animate-spin text-primary" aria-hidden />
      ) : (
        <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border border-muted-foreground/40" />
      )}
      <span className={state === "pending" ? "text-muted-foreground" : "text-foreground"}>{label}</span>
    </li>
  );
}

export default function AiAssistantCard({
  onPatch,
  existingContent,
  hasFeaturedImage,
  defaultOpen = true,
}: {
  onPatch: (patch: AiPatch) => void;
  /** The body's current HTML, so a non-empty body triggers the Replace/Insert choice instead of a silent overwrite. */
  existingContent: string;
  /** A featured image is already set: generating a new one becomes an explicit "replace" choice, off by default. */
  hasFeaturedImage: boolean;
  defaultOpen?: boolean;
}) {
  const [tone, setTone] = useState<Tone>("Professional");
  const [length, setLength] = useState<Length>("Medium");
  // null = follow the default (on only while there is no featured image), so
  // choosing an image from the library flips it off without an effect.
  const [featuredChoice, setFeaturedChoice] = useState<boolean | null>(null);
  const withFeatured = featuredChoice ?? !hasFeaturedImage;
  const [withInline, setWithInline] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askReplaceInsert, setAskReplaceInsert] = useState(false);

  const [draftStep, setDraftStep] = useState<"pending" | "active" | "done">("pending");
  const [imagesStep, setImagesStep] = useState<"pending" | "active" | "done">("pending");
  const [imageStatuses, setImageStatuses] = useState<Record<string, ImageStatus>>({});

  const [hasContentImages, setHasContentImages] = useState(false);
  const [providerStatus, setProviderStatus] = useState<string | null>(null);

  const bodyMarkdownRef = useRef("");
  const insertModeRef = useRef(false);
  const baseContentRef = useRef("");

  /** Converts the current Markdown source to HTML and pushes it up, merged with the pre-generation content when the admin chose Insert. */
  function emitBody() {
    const html = markdownToHtml(bodyMarkdownRef.current);
    onPatch({ type: "body", html: insertModeRef.current && baseContentRef.current ? `${baseContentRef.current}\n${html}` : html });
  }

  async function runGeneration() {
    setBusy(true);
    setError(null);
    setProviderStatus(null);
    setDraftStep("active");
    setImagesStep("pending");
    setImageStatuses({});
    onPatch({ type: "start" });

    try {
      const response = await fetch("/api/admin/ai/generate-post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, tone, length, featuredImage: withFeatured, inlineImages: withInline }),
      });

      if (!response.ok || !response.body) {
        // Error responses are JSON { ok: false, error } (a 429 says when to retry).
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error || "The AI assistant is unreachable right now.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");

          const parsed = parseSseChunk(raw);
          if (!parsed) continue;
          const { event, data } = parsed;

          if (event === "provider_status") {
            const payload = data as { provider: string; status: string; message: string };
            setProviderStatus(payload.message);
          } else if (event === "content") {
            setProviderStatus(null);
            const payload = data as {
              title: string;
              slug: string;
              excerpt: string;
              bodyMarkdown: string;
              seoTitle: string;
              seoDescription: string;
              topic: string;
              tags: string[];
              featuredImageAlt: string;
              contentImages: ContentImageMeta[];
            };
            bodyMarkdownRef.current = payload.bodyMarkdown;
            setHasContentImages(payload.contentImages.length > 0);
            setDraftStep("done");
            setImagesStep("active");
            onPatch({
              type: "meta",
              title: payload.title,
              slug: payload.slug,
              excerpt: payload.excerpt,
              seoTitle: payload.seoTitle,
              seoDescription: payload.seoDescription,
              topic: payload.topic,
              tags: payload.tags,
            });
            emitBody();
            onPatch({ type: "featuredAlt", alt: payload.featuredImageAlt });
          } else if (event === "image") {
            const payload = data as { which: string; status: ImageStatus; url?: string; mediaId?: string; alt?: string; error?: string };
            setImageStatuses((current) => ({ ...current, [payload.which]: payload.status }));

            if (payload.which === "featured") {
              if (payload.status === "start") onPatch({ type: "featuredImageBusy", busy: true });
              else {
                onPatch({ type: "featuredImageBusy", busy: false });
                if (payload.status === "done" && payload.url && payload.mediaId) {
                  onPatch({ type: "featuredImage", mediaId: payload.mediaId, url: payload.url, alt: payload.alt || "" });
                }
              }
            } else if (payload.status !== "start") {
              // A content-image token: resolve (or placeholder) it in the
              // Markdown source and push the re-rendered HTML up.
              const resolved = payload.status === "done" && payload.url ? { url: payload.url, alt: payload.alt || "" } : null;
              bodyMarkdownRef.current = applyImageToken(bodyMarkdownRef.current, payload.which, resolved);
              emitBody();
            }
          } else if (event === "error") {
            setProviderStatus(null);
            const payload = data as { error: string };
            setError(payload.error);
            onPatch({ type: "error", message: payload.error });
          } else if (event === "done") {
            setImagesStep("done");
          }
        }
      }
    } catch {
      setError("The AI assistant is unreachable right now.");
    } finally {
      setBusy(false);
    }
  }

  function startGenerate() {
    if (!prompt.trim() || busy) return;
    setError(null);
    // A non-empty body always asks first; clicking Generate again while the
    // question is open must not silently replace the body.
    if (existingContent.trim()) {
      setAskReplaceInsert(true);
      return;
    }
    // Empty body: always a plain replace. Without this reset, an Insert
    // chosen on an earlier run would prepend that run's stale base content.
    chooseAndGenerate(false);
  }

  function chooseAndGenerate(insert: boolean) {
    insertModeRef.current = insert;
    baseContentRef.current = insert ? existingContent : "";
    setAskReplaceInsert(false);
    void runGeneration();
  }

  return (
    <SidebarCard title="AI Assistant" defaultOpen={defaultOpen}>
      <label htmlFor="ai-prompt" className="block text-sm font-medium">
        What should this post be about?
      </label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        The assistant writes the whole post (title, structured body, SEO fields, tags) and fills every field.
      </p>
      <textarea
        id="ai-prompt"
        className={cn(textareaClass, "mt-2 min-h-24")}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            startGenerate();
          }
        }}
        placeholder="E.g., Write a post about debugging a tricky race condition in a Next.js server action…"
        maxLength={2000}
        disabled={busy}
      />

      <div className="mt-3 grid gap-3 s640:grid-cols-2 xl:grid-cols-4">
        <div>
          <label htmlFor="ai-tone" className="text-xs font-medium text-muted-foreground">
            Tone
          </label>
          <select id="ai-tone" className={cn(fieldClass, "mt-1")} value={tone} onChange={(event) => setTone(event.target.value as Tone)} disabled={busy}>
            {(["Professional", "Friendly", "Technical", "Casual"] as const).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ai-length" className="text-xs font-medium text-muted-foreground">
            Length
          </label>
          <select id="ai-length" className={cn(fieldClass, "mt-1")} value={length} onChange={(event) => setLength(event.target.value as Length)} disabled={busy}>
            {(["Short", "Medium", "Long"] as const).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="s640:col-span-2" disabled={busy}>
          <legend className="text-xs font-medium text-muted-foreground">Images</legend>
          <div className="mt-1 flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={withFeatured}
                onChange={(event) => setFeaturedChoice(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              {hasFeaturedImage ? "Replace featured image" : "Featured image"}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={withInline}
                onChange={(event) => setWithInline(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Inline images (up to 3)
            </label>
          </div>
        </fieldset>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Ctrl/Cmd + Enter to generate</p>
        <button type="button" onClick={startGenerate} disabled={busy || !prompt.trim()} className={cn(buttonVariants.primary, "gap-2")}>
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
          {busy ? "Generating…" : "Generate post"}
        </button>
      </div>

      {askReplaceInsert ? (
        <div role="alertdialog" aria-label="Replace or insert" className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p>The body already has content. Replace it, or insert the new draft below what&apos;s there?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => chooseAndGenerate(false)} className="rounded-md border border-input bg-background px-3 py-1 text-xs font-medium hover:bg-muted">
              Replace
            </button>
            <button type="button" onClick={() => chooseAndGenerate(true)} className="rounded-md border border-input bg-background px-3 py-1 text-xs font-medium hover:bg-muted">
              Insert below
            </button>
            <button type="button" onClick={() => setAskReplaceInsert(false)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {busy || draftStep === "done" ? (
        <ul aria-live="polite" className="mt-3 space-y-1.5 rounded-md border border-border bg-muted/20 p-3">
          <StepRow state={draftStep} label="Drafting & structuring the post" />
          {draftStep === "active" && providerStatus ? (
            <li className="ml-5 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              {providerStatus}
            </li>
          ) : null}
          {draftStep !== "pending" ? (
            <StepRow state={imagesStep} label={hasContentImages || imagesStep !== "pending" ? "Generating images" : "Generating images (none needed)"} />
          ) : null}
          {Object.entries(imageStatuses).map(([token, status]) => (
            <li key={token} className="ml-5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  status === "done" ? "bg-emerald-500" : status === "error" || status === "unavailable" ? "bg-amber-500" : "bg-primary animate-pulse"
                )}
              />
              {token === "featured" ? "Featured image" : "Inline image"} — {status}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </SidebarCard>
  );
}
