import { registerUpload } from "@/lib/actions/media";

// Browser-side upload into the media library: sign on the server
// (/api/admin/uploads/sign), post the file straight to Cloudinary, then record
// it with the registerUpload Server Action, which re-checks folder, type and
// size before creating the MediaAsset row. Used by the media picker and by the
// featured-image card's "upload it myself" fallback when a server-side upload
// of a generated image failed.

export type UploadResult = { ok: true; mediaId: string; url: string } | { ok: false; error: string };

interface SignResponse {
  cloudName: string;
  apiKey: string;
  params: Record<string, string>;
  signature: string;
  folder: string;
  error?: string;
}

export async function uploadToMediaLibrary(file: Blob, options: { fileName?: string; alt?: string } = {}): Promise<UploadResult> {
  try {
    const signResponse = await fetch("/api/admin/uploads/sign");
    const sign = (await signResponse.json().catch(() => null)) as SignResponse | null;
    if (!signResponse.ok || !sign?.signature) return { ok: false, error: sign?.error || "Could not start the upload." };

    const form = new FormData();
    form.append("file", file, options.fileName ?? "upload");
    form.append("api_key", sign.apiKey);
    for (const [key, value] of Object.entries(sign.params)) form.append(key, value);
    form.append("signature", sign.signature);

    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(sign.cloudName)}/auto/upload`, {
      method: "POST",
      body: form,
    });
    const uploaded = (await uploadResponse.json().catch(() => null)) as { public_id?: string; error?: { message?: string } } | null;
    if (!uploadResponse.ok || !uploaded?.public_id) {
      return { ok: false, error: uploaded?.error?.message ? `Upload failed: ${uploaded.error.message}` : "Upload failed." };
    }

    const registered = await registerUpload(uploaded.public_id, sign.folder, options.alt);
    if (!registered.ok || !registered.asset) return { ok: false, error: registered.error || "The upload could not be recorded." };
    return { ok: true, mediaId: registered.asset.id, url: registered.asset.url };
  } catch {
    return { ok: false, error: "The upload could not reach the server." };
  }
}

/**
 * Base64 image bytes as a Blob, for re-uploading an image the browser already
 * holds. Decoded by hand: fetch(dataUrl) would be blocked by the CSP's
 * connect-src, which does not allow data:.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
