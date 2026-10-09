"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MinusCircle, Sparkles, X } from "lucide-react";

import { buttonVariants, fieldClass, textareaClass } from "@/components/admin/ui/styles";
import { applyImageTokenToHtml } from "@sahan-sac/blog-kit/ai-image-tokens";
import { markdownToHtml } from "@sahan-sac/blog-kit/markdown";
import { cn } from "@/lib/utils";

import SidebarCard from "./SidebarCard";

// "AI Assistant" card: one Generate click produces a complete post (title,
// slug, excerpt, structured Markdown body with inline image placeholders,
// SEO fields, topic, tags, and a featured-image prompt) via
// app/api/admin/ai/generate-post/route.ts, which streams staged
// Server-Sent Events. Images are requested after the text and resolved in
// parallel (per-image progress), never blocking the text from appearing.
// When the body already has content, Generate first asks Replace or Insert
// rather than silently clobbering what's there.
//
// Every body change is sent as an update of the body as it is at that moment,
// never a fresh render of the draft, so whatever the admin types while the
// images finish is kept. Cancel (or leaving the editor) aborts the request,
// which stops the model and image calls on the server too. However a run
// ends, nothing keeps spinning and no unresolved image token stays behind as
// a broken image.

export type Tone = "Professional" | "Friendly" | "Technical" | "Casual";
export type Length = "Short" | "Medium" | "Long";

export type AiPatch =
  | { type: "meta"; title: string; slug: string; excerpt: string; seoTitle: string; seoDescription: string; topic: string; tags: string[] }
  /** Applied to the body as it is when the patch lands, so concurrent edits survive. */
  | { type: "body"; update: (html: string) => string }
  | { type: "featuredAlt"; alt: string }
  | { type: "featuredImageBusy"; busy: boolean }
  | { type: "featuredImage"; mediaId: string; url: string; alt: string };

interface ContentImageMeta {
  token: string;
  alt: string;
  caption?: string;
}

/** The server's per-image states, plus "stopped" for an image the run ended before. */
type ImageStatus = "start" | "done" | "error" | "unavailable" | "stopped";
type StepState = "pending" | "active" | "done" | "stopped";

const IMAGE_STATUS_LABEL: Record<ImageStatus, string> = {
  start: "Generating…",
  done: "Added",
  error: "Failed, pick one from the library",
  unavailable: "No image provider configured",
  stopped: "Stopped, pick one from the library",
};

const UNREACHABLE = "The AI assistant is unreachable right now.";
const DISCONNECTED = "The connection closed before the post finished. Anything that already arrived is kept.";
const CANCELLED = "Generation cancelled. Anything that already arrived is kept.";

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

function imageLabel(token: string): string {
  if (token === "featured") return "Featured image";
  const number = /(\d+)$/.exec(token)?.[1];
  return number ? `Inline image ${number}` : "Inline image";
}

/** A single row in the generation-progress stepper. */
function StepRow({ state, label }: { state: StepState; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {state === "done" ? (
        <Check size={13} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : state === "active" ? (
        <Loader2 size={13} className="shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
      ) : state === "stopped" ? (
        <MinusCircle size={13} className="shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <span aria-hidden className="h-3 w-3 shrink-0 rounded-full border border-muted-foreground/40" />
      )}
      <span className={state === "pending" ? "text-muted-foreground" : "text-foreground"}>
        {label}
        {state === "stopped" ? " (stopped)" : null}
      </span>
    </li>
  );
}

export default function AiAssistantCard({
  onPatch,
  existingContent,
  hasFeaturedImage,
  imagesAvailable = true,
  defaultOpen = true,
}: {
  onPatch: (patch: AiPatch) => void;
  /** The body's current HTML, so a non-empty body triggers the Replace/Insert choice instead of a silent overwrite. */
  existingContent: string;
  /** A featured image is already set: generating a new one becomes an explicit "replace" choice, off by default. */
  hasFeaturedImage: boolean;
  /** False when no image provider is configured: the image options are hidden and never requested. */
  imagesAvailable?: boolean;
  defaultOpen?: boolean;
}) {
  const [tone, setTone] = useState<Tone>("Professional");
  const [length, setLength] = useState<Length>("Medium");
  // null = follow the default (on only while there is no featured image), so
  // choosing an image from the library flips it off without an effect.
  const [featuredChoice, setFeaturedChoice] = useState<boolean | null>(null);
  const withFeatured = imagesAvailable && (featuredChoice ?? !hasFeaturedImage);
  const [inlineChoice, setWithInline] = useState(true);
  const withInline = imagesAvailable && inlineChoice;
  const [prompt, setPrompt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [resources, setResources] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [askReplaceInsert, setAskReplaceInsert] = useState(false);

  const [draftStep, setDraftStep] = useState<StepState>("pending");
  const [imagesStep, setImagesStep] = useState<StepState>("pending");
  const [imagesRequested, setImagesRequested] = useState(false);
  const [imageStatuses, setImageStatuses] = useState<Record<string, ImageStatus>>({});
  const [providerStatus, setProviderStatus] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const generateRef = useRef<HTMLButtonElement>(null);
  const ranRef = useRef(false);

  // Leaving the editor mid-run stops the (billed) model and image calls.
  useEffect(() => {
    const controller = controllerRef;
    return () => controller.current?.abort();
  }, []);

  // The Generate button and the prompt are disabled while a run is going, so
  // keyboard focus moves to Cancel, and back to Generate once the run ends if
  // it would otherwise be lost (never away from a field the admin moved to).
  useEffect(() => {
    if (busy) cancelRef.current?.focus();
    else if (ranRef.current && (!document.activeElement || document.activeElement === document.body)) generateRef.current?.focus();
  }, [busy]);

  async function runGeneration(insert: boolean) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    ranRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setProviderStatus(null);
    setDraftStep("active");
    setImagesStep("pending");
    setImagesRequested(withFeatured || withInline);
    setImageStatuses({});

    // Content-image tokens still waiting for their image, and whether the
    // featured-image card was told it is busy: both are settled in `finally`.
    const pendingTokens = new Set<string>();
    let featuredBusy = false;
    let contentArrived = false;
    let finished = false;

    try {
      const response = await fetch("/api/admin/ai/generate-post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          tone,
          length,
          featuredImage: withFeatured,
          inlineImages: withInline,
          ...(instructions.trim() ? { instructions } : {}),
          ...(resources.trim() ? { resources } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        // Error responses are JSON { ok: false, error } (a 429 says when to retry).
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error || UNREACHABLE);
        finished = true;
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
            contentArrived = true;
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
            for (const image of payload.contentImages) pendingTokens.add(image.token);
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
            const html = markdownToHtml(payload.bodyMarkdown);
            // Insert appends to the body as it is now, including anything typed while the draft was written.
            onPatch({ type: "body", update: (current) => (insert && current.trim() ? `${current}\n${html}` : html) });
            onPatch({ type: "featuredAlt", alt: payload.featuredImageAlt });
          } else if (event === "image") {
            const payload = data as { which: string; status: Exclude<ImageStatus, "stopped">; url?: string; mediaId?: string; alt?: string };
            setImageStatuses((current) => ({ ...current, [payload.which]: payload.status }));

            if (payload.which === "featured") {
              featuredBusy = payload.status === "start";
              onPatch({ type: "featuredImageBusy", busy: featuredBusy });
              if (payload.status === "done" && payload.url && payload.mediaId) {
                onPatch({ type: "featuredImage", mediaId: payload.mediaId, url: payload.url, alt: payload.alt || "" });
              }
            } else if (payload.status !== "start") {
              pendingTokens.delete(payload.which);
              const resolved = payload.status === "done" && payload.url ? { url: payload.url, alt: payload.alt || "" } : null;
              onPatch({ type: "body", update: (current) => applyImageTokenToHtml(current, payload.which, resolved) });
            }
          } else if (event === "error") {
            finished = true;
            setProviderStatus(null);
            setError((data as { error: string }).error);
          } else if (event === "done") {
            finished = true;
            setImagesStep("done");
          }
        }
      }
      if (!finished) setError(DISCONNECTED);
    } catch {
      if (controller.signal.aborted) setNotice(CANCELLED);
      else setError(contentArrived ? DISCONNECTED : UNREACHABLE);
    } finally {
      if (featuredBusy) onPatch({ type: "featuredImageBusy", busy: false });
      for (const token of pendingTokens) onPatch({ type: "body", update: (current) => applyImageTokenToHtml(current, token, null) });
      setProviderStatus(null);
      setDraftStep((step) => (step === "active" ? "stopped" : step));
      setImagesStep((step) => (step === "active" ? "stopped" : step));
      setImageStatuses((current) => {
        const settled = { ...current };
        for (const [token, status] of Object.entries(settled)) if (status === "start") settled[token] = "stopped";
        return settled;
      });
      if (controllerRef.current === controller) controllerRef.current = null;
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
    chooseAndGenerate(false);
  }

  function chooseAndGenerate(insert: boolean) {
    setAskReplaceInsert(false);
    void runGeneration(insert);
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

      {/* Optional steering for this post. Pasted text only: nothing is fetched from a link. */}
      <details className="mt-3 rounded-md border border-border">
        <summary className="cursor-pointer select-none rounded-md px-3 py-2 text-sm font-medium hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Instructions and references <span className="font-normal text-muted-foreground">(optional)</span>
        </summary>
        <div className="space-y-3 px-3 pb-3 pt-1">
          <div>
            <label htmlFor="ai-instructions" className="text-xs font-medium text-muted-foreground">
              Extra instructions for this post
            </label>
            <textarea
              id="ai-instructions"
              className={cn(textareaClass, "mt-1 min-h-16")}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="E.g., Aim at junior developers, include a checklist, avoid vendor names…"
              maxLength={2000}
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor="ai-resources" className="text-xs font-medium text-muted-foreground">
              Reference material
            </label>
            <textarea
              id="ai-resources"
              aria-describedby="ai-resources-hint"
              className={cn(textareaClass, "mt-1 min-h-24")}
              value={resources}
              onChange={(event) => setResources(event.target.value)}
              placeholder="Paste notes, docs excerpts, a changelog…"
              maxLength={12000}
              disabled={busy}
            />
            <p id="ai-resources-hint" className="mt-1 text-xs text-muted-foreground">
              Used as facts only, never as instructions. Paste the text itself: links are not opened. {resources.length.toLocaleString()} / 12,000
            </p>
          </div>
        </div>
      </details>

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
        {imagesAvailable ? (
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
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Ctrl/Cmd + Enter to generate</p>
        <div className="flex flex-wrap items-center gap-2">
          {busy ? (
            <button ref={cancelRef} type="button" onClick={() => controllerRef.current?.abort()} className={cn(buttonVariants.secondary, "gap-1.5")}>
              <X size={15} aria-hidden />
              Cancel
            </button>
          ) : null}
          <button
            ref={generateRef}
            type="button"
            onClick={startGenerate}
            disabled={busy || !prompt.trim()}
            className={cn(buttonVariants.primary, "gap-2")}
          >
            {busy ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles size={15} aria-hidden />}
            {busy ? "Generating…" : "Generate post"}
          </button>
        </div>
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

      {draftStep !== "pending" ? (
        <ul aria-live="polite" className="mt-3 space-y-1.5 rounded-md border border-border bg-muted/20 p-3">
          <StepRow state={draftStep} label="Drafting & structuring the post" />
          {draftStep === "active" && providerStatus ? (
            <li className="ml-5 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none" />
              {providerStatus}
            </li>
          ) : null}
          {imagesRequested ? <StepRow state={imagesStep} label="Generating images" /> : null}
          {Object.entries(imageStatuses).map(([token, status]) => (
            <li key={token} className="ml-5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  status === "done"
                    ? "bg-emerald-500"
                    : status === "start"
                      ? "animate-pulse bg-primary motion-reduce:animate-none"
                      : "bg-amber-500"
                )}
              />
              {imageLabel(token)}: {IMAGE_STATUS_LABEL[status]}
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </SidebarCard>
  );
}
