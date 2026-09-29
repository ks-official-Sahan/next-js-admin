import "server-only";

import type { ImageSink } from "@sahan-sac/blog-kit/images";

import { cloudinary } from "@/lib/media/cloudinary-client";
import { registerGeneratedImage } from "@/lib/media/service";

/** Keeps AI blog images in the media library: Cloudinary plus a MediaAsset row, audited as `actor`. */
export function mediaLibrarySink(actor: { id: string; email: string }): ImageSink {
  return {
    async storeGenerated(image, meta) {
      const registered = await registerGeneratedImage({ ...image, ...meta, cloudinaryClient: cloudinary }, actor);
      return registered.ok ? { ok: true, mediaId: registered.asset.id, url: registered.asset.url } : { ok: false, error: registered.error };
    },
  };
}
