"use server";

import { revalidatePath } from "next/cache";

import { authorizeAction } from "@/lib/actions/guard";
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
  alt?: string,
  accountId?: string
): Promise<{ ok: boolean; error?: string; asset?: { id: string; url: string } }> {
  const auth = await authorizeAction("uploadMedia");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof publicId !== "string" || typeof folder !== "string" || (accountId !== undefined && typeof accountId !== "string")) {
    return { ok: false, error: "The upload details were not readable." };
  }

  const result = await registerUploadService({ publicId, folder, alt, accountId }, auth.user);
  if (result.ok) revalidatePath("/admin/media");
  return result;
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

  if (result.ok) {
    revalidatePath("/admin/media");
    revalidatePath(`/admin/media/${mediaId}`);
  }
  return result;
}

export async function deleteMedia(mediaId: string): Promise<DeleteMediaResult> {
  const auth = await authorizeAction("deleteMedia");
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await deleteMediaService(mediaId, auth.user);
  if (result.ok) {
    revalidatePath("/admin/media");
    revalidatePath(`/admin/media/${mediaId}`);
  }
  return result;
}
