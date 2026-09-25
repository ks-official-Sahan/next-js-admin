import { NextResponse, type NextRequest } from "next/server";

import { getOptionalUser, hasPermission } from "@/lib/auth/dal";
import { env } from "@/lib/env";
import { MEDIA_CONFIG } from "@/lib/media/config";
import { signCloudinaryUpload } from "@/lib/media/signature";
import { checkOrigin } from "@/lib/security/check-origin";
import { limit } from "@/lib/cache/ratelimit";

// GET /api/admin/uploads/sign
// Returns signed upload parameters for Cloudinary unsigned widget.
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

  // Generate unsigned upload parameters
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    cloud_name: env.CLOUDINARY_CLOUD_NAME || "",
    upload_preset: "app_unsigned", // Should be created in Cloudinary dashboard
    folder: MEDIA_CONFIG.uploadFolder,
    use_filename: "true",
    unique_filename: "false",
    overwrite: "false",
    allowed_formats: [...MEDIA_CONFIG.images.formats, ...MEDIA_CONFIG.documents.formats].join(","),
    max_file_size: String(MEDIA_CONFIG.images.maxSizeBytes),
    timestamp: String(timestamp),
  };

  // Sign the parameters
  const signature = signCloudinaryUpload(params, env.CLOUDINARY_API_SECRET);

  return NextResponse.json(
    {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      uploadPreset: "app_unsigned",
      signature,
      timestamp,
      folder: MEDIA_CONFIG.uploadFolder,
      allowedFormats: [...MEDIA_CONFIG.images.formats, ...MEDIA_CONFIG.documents.formats],
      maxSizeBytes: MEDIA_CONFIG.images.maxSizeBytes,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
