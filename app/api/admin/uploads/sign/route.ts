import { NextResponse, type NextRequest } from "next/server";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { MEDIA_CONFIG } from "@/lib/media/config";
import { signCloudinaryUpload } from "@/lib/media/signature";
import { checkOrigin } from "@/lib/security/check-origin";
import { limit } from "@/lib/cache/ratelimit";

// GET /api/admin/uploads/sign
// Returns a signed Cloudinary upload for the browser to post the file with
// directly (lib/media/upload-client.ts). `params` is exactly what was signed
// and must be sent as-is, plus `file`, `api_key` and `signature`; Cloudinary
// rejects any param that was not signed. allowed_formats is signed, so
// Cloudinary itself refuses other types; registerUpload re-checks folder,
// type and size before the asset is recorded.
// Requires uploadMedia permission and passes origin checks.

export const dynamic = "force-dynamic";

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
const forbidden = () => new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  // Check auth and permission
  const user = await getOptionalUser();
  if (!user || user.mustChangePassword) return notFound();
  if (!hasPermission(user, "uploadMedia")) return notFound();

  // Check origin
  const { headers } = request;
  if (!checkOrigin(headers, request)) return forbidden();

  // Rate limit: per user (generous, users may sign multiple uploads)
  const limited = await limit("upload:sign:user", user.id);
  if (!limited.ok) return new NextResponse(null, { status: 429, headers: { "Cache-Control": "no-store" } });

  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return NextResponse.json({ ok: false, error: "Media uploads are not configured on this server." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const params = {
    folder: MEDIA_CONFIG.uploadFolder,
    allowed_formats: [...MEDIA_CONFIG.images.formats, ...MEDIA_CONFIG.documents.formats].join(","),
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const signature = signCloudinaryUpload(params, env.CLOUDINARY_API_SECRET);

  return NextResponse.json(
    {
      ok: true,
      // The API key identifies the account (it is not the secret); Cloudinary
      // needs it on every signed upload.
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      params,
      signature,
      folder: MEDIA_CONFIG.uploadFolder,
      maxSizeBytes: MEDIA_CONFIG.images.maxSizeBytes,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
