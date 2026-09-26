"use client";

import { useState } from "react";

import { buttonVariants, fieldClass } from "@/components/admin/ui/styles";
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import { base64ToBlob, uploadToMediaLibrary } from "@/lib/media/upload-client";
import { cn } from "@/lib/utils";

import SidebarCard from "./SidebarCard";

// "Featured image" card: preview, choose-from-library, clear, and one AI
// image prompt that generates a fresh media asset and sets it as featured
// (app/api/admin/ai/generate-image/route.ts). When the image generates but
// the server cannot store it, the route sends the bytes back: the card shows
// them as an unsaved preview with Download, a browser-side upload retry
// (lib/media/upload-client.ts) and Discard, so the generation is not lost.
// Until it is uploaded, the preview is not the post's featured image.

type UnsavedImage = { base64: string; mimeType: string };

const EXTENSION: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export default function FeaturedImageCard({
  src,
  alt,
  onAltChange,
  onSelect,
  onClear,
  generating = false,
}: {
  src: string | null;
  alt: string;
  onAltChange: (alt: string) => void;
  onSelect: (result: { mediaId: string; src: string; alt: string }) => void;
  onClear: () => void;
  /** The AI assistant is generating the featured image with the post. */
  generating?: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<UnsavedImage | null>(null);
  const [uploading, setUploading] = useState(false);
  const unsavedUrl = unsaved ? `data:${unsaved.mimeType};base64,${unsaved.base64}` : null;
  const unsavedName = unsaved ? `featured-image.${EXTENSION[unsaved.mimeType] ?? "png"}` : "";

  async function uploadUnsaved() {
    if (!unsaved) return;
    setUploading(true);
    setError(null);
    const altText = alt || prompt.slice(0, 150);
    const result = await uploadToMediaLibrary(base64ToBlob(unsaved.base64, unsaved.mimeType), { fileName: unsavedName, alt: altText || undefined });
    setUploading(false);
    if (!result.ok) {
      setError(`${result.error} You can still download the image.`);
      return;
    }
    setUnsaved(null);
    onSelect({ mediaId: result.mediaId, src: result.url, alt: altText });
  }

  async function generate() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setUnsaved(null);
    try {
      const response = await fetch("/api/admin/ai/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, alt: alt || prompt.slice(0, 150) }),
      });
      const data = (await response.json()) as { ok: boolean; url?: string; mediaId?: string; alt?: string; error?: string; image?: UnsavedImage };
      if (!data.ok || !data.url || !data.mediaId) {
        if (data.image) {
          setUnsaved(data.image);
          setError(`${data.error || "The image could not be saved."} It is not set as the featured image yet: upload it again or download it.`);
          return;
        }
        setError(data.error || "Image generation failed.");
        return;
      }
      onSelect({ mediaId: data.mediaId, src: data.url, alt: data.alt || alt });
    } catch {
      setError("Image generation is unreachable right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SidebarCard title="Featured image">
      <div
        className="relative flex aspect-video items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/30"
        aria-busy={generating || busy}
      >
        {unsavedUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- in-memory preview of an image not stored yet */}
            <img src={unsavedUrl} alt={alt || "Generated image, not saved"} className="h-full w-full object-cover" />
            <span className="absolute left-2 top-2 rounded bg-amber-500 px-1.5 py-0.5 text-xs font-medium text-black">Not saved</span>
          </>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview of a Cloudinary/LOCAL asset
          <img src={src} alt={alt || ""} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm text-muted-foreground">No image selected</span>
        )}
        {generating || busy ? (
          <span className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm font-medium backdrop-blur-sm">
            <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Generating image…
          </span>
        ) : null}
      </div>

      {unsavedUrl ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={uploadUnsaved} disabled={uploading} className={buttonVariants.small}>
            {uploading ? "Uploading…" : "Upload and use"}
          </button>
          <a href={unsavedUrl} download={unsavedName} className={buttonVariants.small}>
            Download
          </a>
          <button type="button" onClick={() => setUnsaved(null)} disabled={uploading} className={buttonVariants.smallDanger}>
            Discard
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MediaPicker kind="IMAGE" onSelect={onSelect} />
        <button type="button" onClick={onClear} disabled={!src} className={buttonVariants.smallDanger}>
          Clear
        </button>
      </div>

      <label htmlFor="featured-image-alt" className="mt-3 block text-sm font-medium">
        Alt text
      </label>
      <input
        id="featured-image-alt"
        className={cn(fieldClass, "mt-1.5")}
        value={alt}
        onChange={(event) => onAltChange(event.target.value)}
        maxLength={200}
        placeholder="Describe the image for screen readers and SEO"
      />

      <div className="mt-4 border-t border-border pt-3">
        <label htmlFor="ai-image-prompt" className="sr-only">
          AI image prompt
        </label>
        <div className="flex items-center gap-2">
          <input
            id="ai-image-prompt"
            className={fieldClass}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Generate one: describe the image…"
            maxLength={500}
            disabled={busy}
          />
          <button
            type="button"
            onClick={generate}
            disabled={busy || !prompt.trim()}
            aria-label="Generate featured image with AI"
            title="Generate featured image with AI"
            className={cn(buttonVariants.primary, "h-10 w-10 shrink-0 px-0")}
          >
            {busy ? <span aria-hidden className="animate-pulse">…</span> : <span aria-hidden>✨</span>}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Generates a fresh media asset with AI and sets it as featured.</p>
        {error ? (
          <p role="alert" className="mt-1.5 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </SidebarCard>
  );
}
