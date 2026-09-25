"use client";

import { useState } from "react";

import { buttonVariants, fieldClass } from "@/components/admin/ui/styles";
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import { cn } from "@/lib/utils";

import SidebarCard from "./SidebarCard";

// "Featured image" card: preview, choose-from-library, clear, and one AI
// image prompt that generates a fresh media asset and sets it as featured
// (app/api/admin/ai/generate-image/route.ts).

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

  async function generate() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/ai/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, alt: alt || prompt.slice(0, 150) }),
      });
      const data = (await response.json()) as { ok: boolean; url?: string; mediaId?: string; alt?: string; error?: string };
      if (!data.ok || !data.url || !data.mediaId) {
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
        {src ? (
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
