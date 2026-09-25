"use server";

import { authorizeAction } from "@/lib/actions/guard";
import { cloudinary } from "@/lib/media/cloudinary";
import {
  deleteMedia as deleteMediaService,
  registerUpload as registerUploadService,
  updateMediaMetadata as updateMediaService,
  type DeleteMediaResult,
} from "@/lib/media/service";

// Server actions for media operations. Each authorizes first, then the permission,
// then calls the service layer.

export async function registerUpload(
  publicId: string,
  folder: string,
  alt?: string
): Promise<{ ok: boolean; error?: string; asset?: { id: string; url: string } }> {
  const auth = await authorizeAction("uploadMedia");
  if (!auth.ok) return { ok: false, error: auth.error };

  return registerUploadService(
    {
      publicId,
      folder,
      alt,
      cloudinaryClient: cloudinary,
    },
    auth.user
  );
}

export async function updateMedia(
  mediaId: string,
  alt: string | null | undefined,
  title: string | null | undefined,
  tags: string[] | undefined
): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorizeAction("uploadMedia");
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await updateMediaService(
    {
      mediaId,
      alt,
      title,
      tags,
    },
    auth.user
  );

  return result;
}

export async function deleteMedia(mediaId: string): Promise<DeleteMediaResult> {
  const auth = await authorizeAction("deleteMedia");
  if (!auth.ok) return { ok: false, error: auth.error };

  return deleteMediaService(mediaId, auth.user, cloudinary);
}
