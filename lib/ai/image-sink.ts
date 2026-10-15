import "server-only";

import type { ImageSink } from "@sahan-sac/blog-kit/images";

import { registerGeneratedImage } from "@/lib/media/service";

/** Keeps AI blog images in the media library: the first storage account that takes them, plus a MediaAsset row, audited as `actor`. */
export function mediaLibrarySink(actor: { id: string; email: string }): ImageSink {
  return {
    async storeGenerated(image, meta) {
      const registered = await registerGeneratedImage({ ...image, ...meta }, actor);
      return registered.ok ? { ok: true, mediaId: registered.asset.id, url: registered.asset.url } : { ok: false, error: registered.error };
    },
  };
}
